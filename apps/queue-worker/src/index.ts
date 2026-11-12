import { createServer } from "node:http";
import { Pool } from "pg";
import { PostgresQueueAdapter, type PostgresPoolLike } from "@jerico/queue/postgres";
import { PollingQueueConsumer } from "@jerico/queue/consumer";
import {
  isValidTelemetryMessage,
  writeToClickHouse,
  type TelemetryMessage,
  type ClickHouseEnv,
} from "@jerico/worker/telemetry";

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
const clickhouseEnv: ClickHouseEnv = {
  CLICKHOUSE_URL: required("CLICKHOUSE_URL"),
  CLICKHOUSE_DATABASE: process.env.CLICKHOUSE_DATABASE ?? "jerico",
  CLICKHOUSE_TABLE: process.env.CLICKHOUSE_TABLE ?? "telemetry_events",
  CLICKHOUSE_USERNAME: process.env.CLICKHOUSE_USERNAME,
  CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD,
  CLICKHOUSE_TOKEN: process.env.CLICKHOUSE_TOKEN,
};
const port = integerEnv("PORT", 8789, 1, 65_535);
const host = process.env.HOST?.trim() || "127.0.0.1";
const pool = new Pool({
  connectionString: databaseUrl,
  max: integerEnv("DATABASE_POOL_MAX", 8, 1, 50),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

const telemetryQueue = new PostgresQueueAdapter<TelemetryMessage>(
  pool as unknown as PostgresPoolLike,
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
const queueAdminToken = process.env.QUEUE_ADMIN_TOKEN;

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function respond(response: import("node:http").ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/ready")) {
    try {
      await pool.query("SELECT 1");
      const queue = await telemetryQueue.health();
      respond(response, queue.status === "unavailable" ? 503 : 200, {
        status: queue.status,
        service: "jerico-queue-worker",
        ready: true,
        ...(url.pathname === "/ready" ? { queue } : {}),
      });
    } catch {
      respond(response, 503, { status: "unavailable", service: "jerico-queue-worker", ready: false });
    }
    return;
  }

  const deadLetterPath = url.pathname === "/dead-letters"
    || /^\/dead-letters\/[^/]+(?:\/replay)?$/.test(url.pathname);
  if (!deadLetterPath) {
    respond(response, 404, { error: "not_found" });
    return;
  }
  if (!queueAdminToken || queueAdminToken.length < 32) {
    respond(response, 404, { error: "not_found" });
    return;
  }
  const authorization = request.headers.authorization ?? "";
  const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!constantTimeEqual(suppliedToken, queueAdminToken)) {
    respond(response, 401, { error: "unauthorized" });
    return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/dead-letters") {
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        respond(response, 400, { error: "invalid_limit", message: "Limit must be between 1 and 100." });
        return;
      }
      respond(response, 200, { data: await telemetryQueue.listDeadLetters(limit) });
      return;
    }

    const replayMatch = url.pathname.match(/^\/dead-letters\/([^/]+)\/replay$/);
    if (request.method === "POST" && replayMatch) {
      const replayed = await telemetryQueue.replayDeadLetter(decodeURIComponent(replayMatch[1]!));
      respond(response, replayed ? 202 : 409, replayed
        ? { data: { replayed: true } }
        : { error: "not_replayable", message: "The dead-letter message is missing, already replayed, or conflicts with an active deduplication key." });
      return;
    }

    const detailMatch = url.pathname.match(/^\/dead-letters\/([^/]+)$/);
    if (request.method === "GET" && detailMatch) {
      const message = await telemetryQueue.getDeadLetter(decodeURIComponent(detailMatch[1]!));
      if (!message) {
        respond(response, 404, { error: "not_found" });
        return;
      }
      respond(response, 200, { data: message });
      return;
    }
    respond(response, 404, { error: "not_found" });
  } catch (error) {
    console.error("Dead-letter administration request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    respond(response, 500, { error: "internal_error" });
  }
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("Stopping Jerico self-hosted telemetry worker", { signal });
  if (server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  await consumer.stop({ timeoutMs: 25_000 });
  await pool.end();
}

async function main(): Promise<void> {
  await pool.query("SELECT 1");
  await telemetryQueue.health();
  await consumer.start();
  server.listen(port, host, () => {
    console.info("Jerico self-hosted telemetry worker is ready", { host, port });
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
