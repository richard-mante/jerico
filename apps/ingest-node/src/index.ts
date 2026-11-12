import { Pool } from "pg";
import { serve } from "@hono/node-server";
import { ingestApp, runScheduledIngestMaintenance, type Bindings } from "@jerico/ingest";
import { PostgresQueueAdapter, type PostgresPoolLike } from "@jerico/queue/postgres";
import type { TelemetryMessage } from "@jerico/worker/telemetry";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required.");
  return value;
}

function integerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(name + " must be an integer between " + minimum + " and " + maximum + ".");
  }
  return value;
}

const pool = new Pool({
  connectionString: required("DATABASE_URL"),
  max: integerEnv("DATABASE_POOL_MAX", 12, 1, 50),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

const queue = new PostgresQueueAdapter<TelemetryMessage>(
  pool as unknown as PostgresPoolLike,
  process.env.TELEMETRY_QUEUE_NAME ?? "jerico-telemetry",
  { maxAttempts: integerEnv("QUEUE_MAX_ATTEMPTS", 5, 1, 100) },
);

const rateLimitRequests = integerEnv("INGEST_RATE_LIMIT_REQUESTS", 120, 1, 100_000);
const rateLimitWindowSeconds = integerEnv("INGEST_RATE_LIMIT_WINDOW_SECONDS", 60, 1, 86_400);

const bindings: Bindings = {
  APP_ENV: "production",
  DATABASE_URL: required("DATABASE_URL"),
  TELEMETRY_QUEUE: queue,
  INGEST_DAILY_EVENT_LIMIT: process.env.INGEST_DAILY_EVENT_LIMIT ?? "100000",
  INGEST_RATE_LIMITER: {
    limit: async ({ key }) => {
      const result = await pool.query<{ request_count: number }>(
        `INSERT INTO ingest_rate_limits (credential_id, window_started_at, request_count)
         VALUES ($1, now(), 1)
         ON CONFLICT (credential_id) DO UPDATE SET
           window_started_at = CASE
             WHEN ingest_rate_limits.window_started_at <= now() - ($2 * interval '1 second')
             THEN now() ELSE ingest_rate_limits.window_started_at END,
           request_count = CASE
             WHEN ingest_rate_limits.window_started_at <= now() - ($2 * interval '1 second')
             THEN 1 ELSE ingest_rate_limits.request_count + 1 END,
           updated_at = now()
         RETURNING request_count`,
        [key, rateLimitWindowSeconds],
      );
      return { success: Number(result.rows[0]?.request_count ?? rateLimitRequests + 1) <= rateLimitRequests };
    },
  },
};

const port = integerEnv("PORT", 8788, 1, 65_535);
const hostname = process.env.HOST?.trim() || "127.0.0.1";
let maintenanceRunning = false;
let shuttingDown = false;

async function maintainOutbox(): Promise<void> {
  if (maintenanceRunning || shuttingDown) return;
  maintenanceRunning = true;
  try {
    await runScheduledIngestMaintenance(bindings);
  } catch (error) {
    console.error("Self-hosted ingestion outbox maintenance failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    maintenanceRunning = false;
  }
}

const maintenanceTimer = setInterval(() => void maintainOutbox(), 15 * 60 * 1000);

let server: ReturnType<typeof serve> | null = null;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(maintenanceTimer);
  console.info("Stopping Jerico self-hosted ingestion API", { signal });
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  await pool.end();
}

process.once("SIGINT", () => void shutdown("SIGINT").catch((error) => {
  console.error("Ingestion shutdown failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
}));
process.once("SIGTERM", () => void shutdown("SIGTERM").catch((error) => {
  console.error("Ingestion shutdown failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
}));

async function main(): Promise<void> {
  await pool.query("SELECT 1");
  await queue.health();
  await maintainOutbox();
  server = serve({
    fetch: (request) => ingestApp.fetch(request, bindings),
    hostname,
    port,
  }, (info) => {
    console.info("Jerico self-hosted ingestion API is ready", {
      hostname: info.address,
      port: info.port,
    });
  });
}

main().catch(async (error) => {
  console.error("Self-hosted ingestion API failed to start", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  clearInterval(maintenanceTimer);
  if (server) server.close();
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
