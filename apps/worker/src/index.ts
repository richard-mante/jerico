type TelemetryEvent = {
  eventId: string;
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
export function toRow(message: TelemetryMessage, event: TelemetryEvent) {
  return {
    event_id: event.eventId,
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
  const rows = messages.flatMap((message) => message.events.map((event) => toRow(message, event)));
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

export default {
  async queue(batch: MessageBatch<TelemetryMessage>, env: ClickHouseEnv): Promise<void> {
    const valid: Message<TelemetryMessage>[] = [];
    for (const message of batch.messages) {
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
