type TelemetryEvent = {
  eventId?: string;
  type: "event" | "error" | "log" | "metric" | "span";
  name: string;
  timestamp?: string;
  message?: string;
  value?: number;
  attributes?: Record<string, string | number | boolean | null>;
};
type TelemetryMessage = {
  schemaVersion: 1;
  requestId: string;
  credentialId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  acceptedAt: string;
  events: TelemetryEvent[];
};
import { probeEndpoint } from "./uptime-probe";

type UptimeProbeMessage = {
  schemaVersion: 1;
  type: "uptime.probe";
  checkId: string;
  monitorId: string;
  organizationId: string;
  projectId: string;
  url: string;
  method: "GET" | "HEAD";
  timeoutMs: number;
  expectedStatusCode: number;
};
type WorkerEnv = ClickHouseEnv & {
  API_URL?: string;
  UPTIME_RESULTS_SECRET?: string;
  PROBE_WORKER_HOST?: string;
};
type ClickHouseEnv = {
  CLICKHOUSE_URL?: string;
  CLICKHOUSE_DATABASE?: string;
  CLICKHOUSE_TABLE?: string;
  CLICKHOUSE_USERNAME?: string;
  CLICKHOUSE_PASSWORD?: string;
  CLICKHOUSE_TOKEN?: string;
};

export function escapeIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error("Invalid ClickHouse identifier.");
  return value;
}
export function toRow(message: TelemetryMessage, event: TelemetryEvent, eventIndex = 0) {
  return {
    // Legacy schemaVersion 1 messages already in the queue have no eventId.
    // requestId + index is stable across redelivery of the same envelope.
    event_id: event.eventId ?? `legacy:${message.requestId}:${eventIndex}`,
    timestamp: event.timestamp ?? message.acceptedAt,
    accepted_at: message.acceptedAt,
    organization_id: message.organizationId,
    project_id: message.projectId,
    environment_id: message.environmentId,
    credential_id: message.credentialId,
    request_id: message.requestId,
    event_type: event.type,
    name: event.name,
    message: event.message ?? "",
    value: event.value ?? null,
    attributes: JSON.stringify(event.attributes ?? {}),
  };
}

export async function writeToClickHouse(env: ClickHouseEnv, messages: TelemetryMessage[]) {
  if (!env.CLICKHOUSE_URL) throw new Error("CLICKHOUSE_URL is not configured.");
  const database = escapeIdentifier(env.CLICKHOUSE_DATABASE ?? "jerico");
  const table = escapeIdentifier(env.CLICKHOUSE_TABLE ?? "telemetry_events");
  const rows = messages.flatMap((message) => message.events.map((event, index) => toRow(message, event, index)));
  if (!rows.length) return;
  const query = encodeURIComponent(`INSERT INTO ${database}.${table} FORMAT JSONEachRow`);
  const headers = new Headers({ "content-type": "application/x-ndjson" });
  if (env.CLICKHOUSE_TOKEN) headers.set("authorization", `Bearer ${env.CLICKHOUSE_TOKEN}`);
  else if (env.CLICKHOUSE_USERNAME || env.CLICKHOUSE_PASSWORD) {
    headers.set("authorization", "Basic " + btoa(`${env.CLICKHOUSE_USERNAME ?? "default"}:${env.CLICKHOUSE_PASSWORD ?? ""}`));
  }
  const response = await fetch(`${env.CLICKHOUSE_URL.replace(/\/$/, "")}/?query=${query}`, {
    method: "POST",
    headers,
    body: rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`ClickHouse insert failed (${response.status}): ${detail}`);
  }
}

async function processUptimeProbe(message: UptimeProbeMessage, env: WorkerEnv): Promise<void> {
  if (!env.API_URL || !env.UPTIME_RESULTS_SECRET || env.UPTIME_RESULTS_SECRET.length < 32 || !env.PROBE_WORKER_HOST) {
    throw new Error("Uptime result callback is not configured.");
  }
  const apiUrl = new URL("/internal/uptime-results", env.API_URL);
  if (apiUrl.protocol !== "https:") throw new Error("Uptime result callback must use HTTPS.");
  const result = await probeEndpoint({
    url: message.url,
    method: message.method,
    timeoutMs: message.timeoutMs,
    expectedStatusCode: message.expectedStatusCode,
    blockedHosts: [env.PROBE_WORKER_HOST],
  });
  const callbackController = new AbortController();
  const callbackTimeout = setTimeout(() => callbackController.abort(), 10000);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      redirect: "error",
      signal: callbackController.signal,
      headers: {
        "content-type": "application/json",
        "x-jerico-uptime-secret": env.UPTIME_RESULTS_SECRET,
      },
      body: JSON.stringify({
        checkId: message.checkId,
        monitorId: message.monitorId,
        organizationId: message.organizationId,
        projectId: message.projectId,
        ...result,
        checkedAt: new Date().toISOString(),
      }),
    });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error("Uptime result callback rejected with status " + response.status + ".");
  } finally {
    clearTimeout(callbackTimeout);
  }
}

async function processUptimeProbeBatch(batch: MessageBatch<UptimeProbeMessage>, env: WorkerEnv): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;
    const validMessage = body?.schemaVersion === 1
      && body.type === "uptime.probe"
      && /^[0-9a-f-]{36}$/i.test(body.checkId)
      && typeof body.monitorId === "string" && body.monitorId.length > 0 && body.monitorId.length <= 128
      && typeof body.organizationId === "string" && body.organizationId.length > 0 && body.organizationId.length <= 128
      && typeof body.projectId === "string" && body.projectId.length > 0 && body.projectId.length <= 128
      && typeof body.url === "string" && body.url.length <= 2048
      && (body.method === "GET" || body.method === "HEAD")
      && Number.isInteger(body.timeoutMs) && body.timeoutMs >= 1000 && body.timeoutMs <= 30000
      && Number.isInteger(body.expectedStatusCode) && body.expectedStatusCode >= 100 && body.expectedStatusCode <= 599;
    if (!validMessage) {
      message.ack();
      continue;
    }
    try {
      await processUptimeProbe(body, env);
      message.ack();
    } catch (error) {
      console.error("Jerico uptime probe processing failed", {
        checkId: body.checkId,
        monitorId: body.monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
      message.retry({ delaySeconds: 30 });
    }
  }
}

export default {
  async queue(batch: MessageBatch<TelemetryMessage | UptimeProbeMessage>, env: WorkerEnv): Promise<void> {
    if (batch.queue === "jerico-uptime-probes") {
      await processUptimeProbeBatch(batch as MessageBatch<UptimeProbeMessage>, env);
      return;
    }
    const telemetryBatch = batch as MessageBatch<TelemetryMessage>;
    const valid: Message<TelemetryMessage>[] = [];
    for (const message of telemetryBatch.messages) {
      if (message.body?.schemaVersion !== 1 || !Array.isArray(message.body.events)) {
        message.ack();
      } else {
        valid.push(message);
      }
    }
    if (!valid.length) return;
    try {
      await writeToClickHouse(env, valid.map((message) => message.body));
      for (const message of valid) message.ack();
    } catch (error) {
      console.error("Jerico telemetry batch write failed", {
        messageCount: valid.length,
        error: error instanceof Error ? error.message : String(error),
      });
      for (const message of valid) message.retry({ delaySeconds: 30 });
    }
  },
};
