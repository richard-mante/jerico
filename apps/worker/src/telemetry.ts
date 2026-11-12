import { telemetryEventSchema } from "@jerico/contracts";

export type TelemetryEvent = {
  eventId?: string;
  type: "event" | "error" | "log" | "metric" | "span";
  name: string;
  timestamp?: string;
  message?: string;
  value?: number;
  attributes?: Record<string, string | number | boolean | null>;
};

export type TelemetryMessage = {
  schemaVersion: 1;
  requestId: string;
  credentialId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  acceptedAt: string;
  events: TelemetryEvent[];
};

export type ClickHouseEnv = {
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
export function isValidTelemetryMessage(value: unknown): value is TelemetryMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.schemaVersion !== 1) return false;
  for (const field of ["requestId", "credentialId", "organizationId", "projectId", "environmentId"] as const) {
    if (typeof message[field] !== "string" || message[field].length < 1 || message[field].length > 128) return false;
  }
  if (typeof message.acceptedAt !== "string" || !Number.isFinite(Date.parse(message.acceptedAt))) return false;
  if (!Array.isArray(message.events) || message.events.length < 1 || message.events.length > 100) return false;

  return message.events.every((event) => {
    if (typeof event !== "object" || event === null || Array.isArray(event)) return false;
    const { eventId, ...telemetryEvent } = event as Record<string, unknown>;
    return typeof eventId === "string"
      && eventId.length >= 1
      && eventId.length <= 256
      && telemetryEventSchema.safeParse(telemetryEvent).success;
  });
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
  const url = new URL(env.CLICKHOUSE_URL);
  url.searchParams.set("query", `INSERT INTO ${database}.${table} FORMAT JSONEachRow`);
  url.searchParams.set("max_execution_time", "8");
  const headers = new Headers({ "content-type": "application/x-ndjson" });
  if (env.CLICKHOUSE_TOKEN) headers.set("authorization", `Bearer ${env.CLICKHOUSE_TOKEN}`);
  else if (env.CLICKHOUSE_USERNAME || env.CLICKHOUSE_PASSWORD) {
    headers.set("authorization", "Basic " + btoa(`${env.CLICKHOUSE_USERNAME ?? "default"}:${env.CLICKHOUSE_PASSWORD ?? ""}`));
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
    body: rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`ClickHouse insert failed (${response.status}): ${detail}`);
  }
}
