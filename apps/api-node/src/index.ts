import { Pool } from "pg";
import { serve } from "@hono/node-server";
import { app, runScheduledApiMaintenance, type ApiServerBindings } from "@jerico/api";
import { PostgresQueueAdapter, type PostgresPoolLike } from "@jerico/queue/postgres";
import type { QueueHealth } from "@jerico/queue";

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

const databaseUrl = required("DATABASE_URL");
const pool = new Pool({
  connectionString: databaseUrl,
  max: integerEnv("DATABASE_POOL_MAX", 12, 1, 50),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
const poolPort = pool as unknown as PostgresPoolLike;
const uptimeQueue = new PostgresQueueAdapter<unknown>(
  poolPort,
  process.env.UPTIME_QUEUE_NAME ?? "jerico-uptime-probes",
  { maxAttempts: integerEnv("QUEUE_MAX_ATTEMPTS", 5, 1, 100) },
);
const notificationQueue = new PostgresQueueAdapter<unknown>(
  poolPort,
  process.env.NOTIFICATION_QUEUE_NAME ?? "jerico-notifications",
  { maxAttempts: integerEnv("QUEUE_MAX_ATTEMPTS", 5, 1, 100) },
);

const bindings: ApiServerBindings = {
  APP_ENV: "production",
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_URL: required("BETTER_AUTH_URL"),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  WEB_APP_URL: required("WEB_APP_URL"),
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  UPTIME_RESULTS_SECRET: required("UPTIME_RESULTS_SECRET"),
  UPTIME_PROBES: uptimeQueue,
  NOTIFICATIONS: notificationQueue,
  NOTIFICATION_DELIVERY_SECRET: required("NOTIFICATION_DELIVERY_SECRET"),
  WEBHOOK_ENCRYPTION_KEY: required("WEBHOOK_ENCRYPTION_KEY"),
  CLICKHOUSE_URL: required("CLICKHOUSE_URL"),
  CLICKHOUSE_DATABASE: process.env.CLICKHOUSE_DATABASE ?? "jerico",
  CLICKHOUSE_TABLE: process.env.CLICKHOUSE_TABLE ?? "telemetry_events",
  CLICKHOUSE_USERNAME: process.env.CLICKHOUSE_USERNAME,
  CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD,
  CLICKHOUSE_TOKEN: process.env.CLICKHOUSE_TOKEN,
};

const port = integerEnv("PORT", 8787, 1, 65_535);
const hostname = process.env.HOST?.trim() || "127.0.0.1";
const queues = [uptimeQueue, notificationQueue];
let server: ReturnType<typeof serve> | null = null;
let maintenanceTimer: ReturnType<typeof setInterval> | null = null;
let maintenanceRunning = false;
let lastDailyPruneDate = "";
let shuttingDown = false;

async function maintain(): Promise<void> {
  if (maintenanceRunning || shuttingDown) return;
  maintenanceRunning = true;
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const includeDailyRetention = now.getUTCHours() >= 3 && lastDailyPruneDate !== today;
    await runScheduledApiMaintenance(bindings, includeDailyRetention);
    if (includeDailyRetention) lastDailyPruneDate = today;
  } catch (error) {
    console.error("Self-hosted API maintenance failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    maintenanceRunning = false;
  }
}

async function healthPayload(): Promise<{ status: QueueHealth["status"]; queues: unknown[] }> {
  await pool.query("SELECT 1");
  const queueStatuses = await Promise.all(queues.map(async (queue) => ({
    name: queue.queueName,
    ...(await queue.health()),
  })));
  const status = queueStatuses.some((queue) => queue.status === "unavailable")
    ? "unavailable"
    : queueStatuses.some((queue) => queue.status === "degraded") ? "degraded" : "healthy";
  return { status, queues: queueStatuses };
}

async function main(): Promise<void> {
  await pool.query("SELECT 1");
  await Promise.all(queues.map((queue) => queue.health()));
  await maintain();

  server = serve({
    fetch: async (request) => {
      const url = new URL(request.url);
      if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/ready")) {
        try {
          const health = await healthPayload();
          return Response.json({
            status: health.status,
            service: "jerico-api-node",
            ready: true,
            ...(url.pathname === "/ready" ? { queues: health.queues } : {}),
          }, { status: health.status === "unavailable" ? 503 : 200 });
        } catch {
          return Response.json({ status: "unavailable", service: "jerico-api-node", ready: false }, { status: 503 });
        }
      }
      return app.fetch(request, bindings);
    },
    hostname,
    port,
  }, (info) => {
    console.info("Jerico self-hosted API is ready", { hostname: info.address, port: info.port });
  });

  maintenanceTimer = setInterval(() => void maintain(), 60_000);
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  console.info("Stopping Jerico self-hosted API", { signal });
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  await pool.end();
}

process.once("SIGINT", () => void shutdown("SIGINT").catch((error) => {
  console.error("API shutdown failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
}));
process.once("SIGTERM", () => void shutdown("SIGTERM").catch((error) => {
  console.error("API shutdown failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
}));

main().catch(async (error) => {
  console.error("Self-hosted API failed to start", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  if (server) server.close();
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
