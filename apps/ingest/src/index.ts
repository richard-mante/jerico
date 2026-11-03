import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { telemetryBatchSchema, type TelemetryEvent } from "@jerico/contracts";
import { projectIngestionKeys, projectIngestionUsage, schema } from "@jerico/database/schema";
import { hashPresentedCredential, readBearerCredential } from "./credentials";
import { redactTelemetryEvent } from "./redaction";
import { DailyQuotaExceeded, dailyEventLimit, secondsUntilUtcMidnight, utcUsageDate } from "./quota";

const MAX_BODY_BYTES = 96 * 1024;
const MAX_BATCH_EVENTS = 100;

type QueueMessage = {
  schemaVersion: 1;
  requestId: string;
  credentialId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  acceptedAt: string;
  events: Array<TelemetryEvent & { eventId: string }>;
};
type QueueBinding = { send(message: QueueMessage): Promise<void> };
type RateLimitBinding = { limit(options: { key: string }): Promise<{ success: boolean }> };
type Bindings = {
  APP_ENV?: string;
  DATABASE_URL?: string;
  HYPERDRIVE?: { connectionString: string };
  TELEMETRY_QUEUE?: QueueBinding;
  INGEST_RATE_LIMITER?: RateLimitBinding;
  INGEST_DAILY_EVENT_LIMIT?: string;
};
type Variables = { requestId: string };
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", async (context, next) => {
  const requestId = context.req.header("x-request-id") ?? crypto.randomUUID();
  context.set("requestId", requestId);
  context.header("x-request-id", requestId);
  await next();
});

app.use("/ingest/*", cors({
  origin: "*",
  allowHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
  allowMethods: ["POST", "OPTIONS"],
  maxAge: 86400,
}));

app.get("/health", (context) => context.json({
  status: "ok",
  service: "ingest",
  pipeline: context.env.TELEMETRY_QUEUE ? "queue-configured" : "not-configured",
}));

async function readBoundedBody(request: Request, limit: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function withCredentialDatabase<T>(
  env: Bindings,
  callback: (database: NodePgDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
  const hyperdrive = env.HYPERDRIVE;
  const connectionString = hyperdrive?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) throw new Error("Ingestion database is not configured.");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await callback(drizzle(client, { schema }));
  } finally {
    if (!hyperdrive) await client.end();
  }
}

async function reserveDailyQuota(
  env: Bindings,
  projectId: string,
  usageDate: string,
  eventCount: number,
): Promise<void> {
  const limit = dailyEventLimit(env.INGEST_DAILY_EVENT_LIMIT);
  await withCredentialDatabase(env, async (database) => database.transaction(async (transaction) => {
    const [usage] = await transaction.insert(projectIngestionUsage).values({
      projectId,
      usageDate,
      eventCount,
    }).onConflictDoUpdate({
      target: [projectIngestionUsage.projectId, projectIngestionUsage.usageDate],
      set: {
        eventCount: sql`${projectIngestionUsage.eventCount} + ${eventCount}`,
        updatedAt: new Date(),
      },
    }).returning({ eventCount: projectIngestionUsage.eventCount });
    if (!usage || usage.eventCount > limit) {
      throw new DailyQuotaExceeded(secondsUntilUtcMidnight());
    }
  }));
}

async function releaseDailyQuota(
  env: Bindings,
  projectId: string,
  usageDate: string,
  eventCount: number,
): Promise<void> {
  await withCredentialDatabase(env, async (database) => {
    await database.update(projectIngestionUsage).set({
      eventCount: sql`GREATEST(${projectIngestionUsage.eventCount} - ${eventCount}, 0)`,
      updatedAt: new Date(),
    }).where(and(
      eq(projectIngestionUsage.projectId, projectId),
      eq(projectIngestionUsage.usageDate, usageDate),
    ));
  });
}

app.post("/ingest/v1/events", async (context) => {
  const requestId = context.get("requestId");
  const queue = context.env.TELEMETRY_QUEUE;
  if (!queue) {
    return context.json({ error: { code: "INGESTION_UNAVAILABLE", message: "Telemetry processing is not configured.", requestId } }, 503);
  }

  const contentType = context.req.header("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return context.json({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Send telemetry using application/json.", requestId } }, 415);
  }

  const contentLength = Number(context.req.header("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return context.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "The request body exceeds 96 KiB.", requestId } }, 413);
  }

  if (context.env.APP_ENV === "production" && !context.env.INGEST_RATE_LIMITER) {
    return context.json({ error: { code: "INGESTION_NOT_CONFIGURED", message: "The production ingestion rate limiter is not configured.", requestId } }, 503);
  }

  const rawKey = readBearerCredential(context.req.header("authorization"));
  if (!rawKey) {
    return context.json({ error: { code: "INVALID_CREDENTIAL", message: "Provide a valid Jerico bearer credential.", requestId } }, 401);
  }

  const bodyText = await readBoundedBody(context.req.raw, MAX_BODY_BYTES);
  if (bodyText === null) {
    return context.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "The request body exceeds 96 KiB.", requestId } }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return context.json({ error: { code: "INVALID_JSON", message: "The request body must be valid JSON.", requestId } }, 400);
  }
  const parsed = telemetryBatchSchema.safeParse(body);
  if (!parsed.success) {
    return context.json({ error: { code: "INVALID_TELEMETRY", message: "The telemetry batch is invalid.", details: parsed.error.flatten(), requestId } }, 400);
  }
  if (parsed.data.events.length > MAX_BATCH_EVENTS) {
    return context.json({ error: { code: "BATCH_TOO_LARGE", message: "A batch may contain at most 100 events.", requestId } }, 400);
  }

  const keyHash = await hashPresentedCredential(rawKey);
  let reservedUsage: { projectId: string; usageDate: string; eventCount: number } | null = null;
  let queueAccepted = false;
  try {
    const credential = await withCredentialDatabase(context.env, async (database) => {
      const [found] = await database.select({
        id: projectIngestionKeys.id,
        organizationId: projectIngestionKeys.organizationId,
        projectId: projectIngestionKeys.projectId,
        environmentId: projectIngestionKeys.environmentId,
        keyType: projectIngestionKeys.keyType,
      }).from(projectIngestionKeys)
        .where(and(eq(projectIngestionKeys.keyHash, keyHash), isNull(projectIngestionKeys.revokedAt)))
        .limit(1);
      return found ?? null;
    });

    if (!credential || (credential.keyType === "public" && !rawKey.startsWith("jk_pub_")) ||
        (credential.keyType === "secret" && !rawKey.startsWith("jk_sec_"))) {
      return context.json({ error: { code: "INVALID_CREDENTIAL", message: "The credential is invalid or revoked.", requestId } }, 401);
    }

    if (context.env.INGEST_RATE_LIMITER) {
      const rate = await context.env.INGEST_RATE_LIMITER.limit({ key: credential.id });
      if (!rate.success) {
        context.header("Retry-After", "60");
        return context.json({ error: { code: "RATE_LIMITED", message: "This credential has exceeded its ingestion request rate limit.", requestId } }, 429);
      }
    }

    if (credential.keyType === "public" && parsed.data.events.some((event) => !["event", "error"].includes(event.type))) {
      return context.json({ error: { code: "INSUFFICIENT_CREDENTIAL_SCOPE", message: "Public credentials may submit only events and errors. Use a server-side secret credential for logs, metrics, and spans.", requestId } }, 403);
    }

    const usageDate = utcUsageDate();
    await reserveDailyQuota(context.env, credential.projectId, usageDate, parsed.data.events.length);
    reservedUsage = { projectId: credential.projectId, usageDate, eventCount: parsed.data.events.length };

    await withCredentialDatabase(context.env, async (database) => {
      await database.update(projectIngestionKeys)
        .set({ lastUsedAt: new Date() })
        .where(and(eq(projectIngestionKeys.id, credential.id), isNull(projectIngestionKeys.revokedAt)));
    });

    const events = parsed.data.events.map((event) => ({
      ...redactTelemetryEvent(event),
      // Generated once before queue publication; retries/redeliveries retain this ID.
      eventId: crypto.randomUUID(),
    }));
    await queue.send({
      schemaVersion: 1,
      requestId,
      credentialId: credential.id,
      organizationId: credential.organizationId,
      projectId: credential.projectId,
      environmentId: credential.environmentId,
      acceptedAt: new Date().toISOString(),
      events,
    });
    queueAccepted = true;

    return context.json({ data: { accepted: events.length, requestId } }, 202);
  } catch (error) {
    if (error instanceof DailyQuotaExceeded) {
      context.header("Retry-After", String(error.retryAfter));
      return context.json({ error: { code: "DAILY_EVENT_QUOTA_EXCEEDED", message: "This credential has reached its daily event quota. Retry after the UTC day resets.", retryAfter: error.retryAfter, requestId } }, 429);
    }
    if (reservedUsage && !queueAccepted) {
      try {
        await releaseDailyQuota(context.env, reservedUsage.projectId, reservedUsage.usageDate, reservedUsage.eventCount);
      } catch (releaseError) {
        console.error("Could not release reserved telemetry quota", { requestId, releaseError });
      }
    }
    console.error("Jerico ingestion request failed", { requestId, error });
    return context.json({ error: { code: "INGESTION_FAILED", message: "Telemetry could not be accepted. Retry with backoff.", requestId } }, 503);
  }
});

app.notFound((context) => context.json({
  error: { code: "NOT_FOUND", message: "Ingestion endpoint not found.", requestId: context.get("requestId") },
}, 404));

app.onError((error, context) => {
  console.error("Jerico ingestion worker error", { requestId: context.get("requestId"), error });
  return context.json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed.", requestId: context.get("requestId") } }, 500);
});

export default app;
