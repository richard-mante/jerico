import { createServer } from "node:http";
import { Pool } from "pg";
import { PostgresQueueAdapter } from "@jerico/queue/postgres";
import { PollingQueueConsumer } from "@jerico/queue/consumer";
import {
  isValidTelemetryMessage,
  writeToClickHouse,
  type TelemetryMessage,
  type WorkerEnv,
} from "@jerico/worker";

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
const clickhouseEnv: WorkerEnv = {
  CLICKHOUSE_URL: required("CLICKHOUSE_URL"),
  CLICKHOUSE_DATABASE: process.env.CLICKHOUSE_DATABASE ?? "jerico",
  CLICKHOUSE_TABLE: process.env.CLICKHOUSE_TABLE ?? "telemetry_events",
  CLICKHOUSE_USERNAME: process.env.CLICKHOUSE_USERNAME,
  CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD,
  CLICKHOUSE_TOKEN: process.env.CLICKHOUSE_TOKEN,
};
const port = integerEnv("PORT", 8789, 1, 65_535);
const pool = new Pool({
  connectionString: databaseUrl,
  max: integerEnv("DATABASE_POOL_MAX", 8, 1, 50),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

const telemetryQueue = new PostgresQueueAdapter<TelemetryMessage>(
  pool,
  process.env.TELEMETRY_QUEUE_NAME ?? "jerico-telemetry",
  { maxAttempts: integerEnv("QUEUE_MAX_ATTEMPTS", 5, 1, 100) },
);

const consumer = new PollingQueueConsumer(
  telemetryQueue,
  async (delivery) => {
    if (!isValidTelemetryMessage(delivery.body)) {
      console.warn("Acknowledging invalid self-hosted telemetry envelope", {
        queueMessageId: delivery.id,
      });
      await delivery.ack();
      return;
    }
    await writeToClickHouse(clickhouseEnv, [delivery.body]);
  },
  {
    batchSize: integerEnv("QUEUE_BATCH_SIZE", 20, 1, 100),
    visibilityTimeoutSeconds: integerEnv("QUEUE_VISIBILITY_TIMEOUT_SECONDS", 60, 1, 3_600),
    pollIntervalMs: integerEnv("QUEUE_POLL_INTERVAL_MS", 1_000, 100, 30_000),
  },
);

let shuttingDown = false;
const server = createServer(async (request, response) => {
  if (request.method !== "GET" || (request.url !== "/health" && request.url !== "/ready")) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  try {
    await pool.query("SELECT 1");
    const queue = await telemetryQueue.health();
    const ready = request.url === "/ready";
    response.writeHead(queue.status === "unavailable" ? 503 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      status: queue.status,
      service: "jerico-queue-worker",
      ready: true,
      ...(ready ? { queue } : {}),
    }));
  } catch {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "unavailable", service: "jerico-queue-worker", ready: false }));
  }
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("Stopping Jerico self-hosted telemetry worker", { signal });
  server.close();
  await consumer.stop({ timeoutMs: 25_000 });
  await pool.end();
}

async function main(): Promise<void> {
  await pool.query("SELECT 1");
  await telemetryQueue.health();
  await consumer.start();
  server.listen(port, "0.0.0.0", () => {
    console.info("Jerico self-hosted telemetry worker is ready", { port });
  });
}

process.once("SIGINT", () => void shutdown("SIGINT").catch((error) => {
  console.error("Worker shutdown failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
}));
process.once("SIGTERM", () => void shutdown("SIGTERM").catch((error) => {
  console.error("Worker shutdown failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
}));

main().catch(async (error) => {
  console.error("Self-hosted queue worker failed to start", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
