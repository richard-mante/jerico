export type TelemetryQueryBindings = {
  CLICKHOUSE_URL?: string;
  CLICKHOUSE_DATABASE?: string;
  CLICKHOUSE_TABLE?: string;
  CLICKHOUSE_USERNAME?: string;
  CLICKHOUSE_PASSWORD?: string;
  CLICKHOUSE_TOKEN?: string;
};

export type TelemetryCursor = { timestamp: string; eventId: string };
export type TelemetryQuery = {
  organizationId: string;
  projectId: string;
  environmentId?: string;
  from: string;
  to: string;
  limit: number;
  cursor?: TelemetryCursor;
  eventType?: "event" | "error" | "log" | "metric" | "span";
};

export type TelemetryRow = {
  eventId: string;
  timestamp: string;
  environmentId: string;
  eventType: string;
  name: string;
  message: string;
  value: number | null;
  attributes: string;
};

export function parseTimeRange(fromValue: string | undefined, toValue: string | undefined, now = new Date()) {
  const to = toValue ? new Date(toValue) : now;
  const from = fromValue ? new Date(fromValue) : new Date(to.getTime() - 60 * 60 * 1000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) return null;
  const maxRangeMs = 31 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxRangeMs || to.getTime() > now.getTime() + 60_000) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}

export function parseQueryLimit(value: string | undefined): number | null {
  if (value === undefined) return 50;
  if (!/^[0-9]{1,3}$/.test(value)) return null;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : null;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,1024}$/.test(value)) throw new Error("Invalid cursor.");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeTelemetryCursor(cursor: TelemetryCursor): string {
  return encodeBase64Url(JSON.stringify(cursor));
}

export function decodeTelemetryCursor(value: string | undefined): TelemetryCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(value));
    if (typeof parsed !== "object" || parsed === null || !("timestamp" in parsed) || !("eventId" in parsed)) return null;
    const timestamp = (parsed as { timestamp: unknown }).timestamp;
    const eventId = (parsed as { eventId: unknown }).eventId;
    if (typeof timestamp !== "string" || !Number.isFinite(new Date(timestamp).getTime())) return null;
    if (typeof eventId !== "string" || eventId.length < 1 || eventId.length > 256) return null;
    return { timestamp: new Date(timestamp).toISOString(), eventId };
  } catch {
    return null;
  }
}

function escapeIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error("Invalid ClickHouse identifier.");
  return value;
}

export async function queryTelemetry<T>(
  env: TelemetryQueryBindings,
  input: TelemetryQuery,
): Promise<T[]> {
  if (!env.CLICKHOUSE_URL) throw new Error("CLICKHOUSE_URL is not configured.");
  const database = escapeIdentifier(env.CLICKHOUSE_DATABASE ?? "jerico");
  const table = escapeIdentifier(env.CLICKHOUSE_TABLE ?? "telemetry_events");
  const filters = [
    "organization_id = {organizationId:String}",
    "project_id = {projectId:String}",
    "timestamp >= parseDateTime64BestEffort({from:String}, 3, 'UTC')",
    "timestamp <= parseDateTime64BestEffort({to:String}, 3, 'UTC')",
  ];
  if (input.environmentId) filters.push("environment_id = {environmentId:String}");
  if (input.eventType) filters.push("event_type = {eventType:String}");
  if (input.cursor) {
    filters.push("(timestamp, event_id) < (parseDateTime64BestEffort({cursorTimestamp:String}, 3, 'UTC'), {cursorEventId:String})");
  }

  const query = `SELECT event_id AS eventId, formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%3fZ', 'UTC') AS timestamp, environment_id AS environmentId, event_type AS eventType, name, message, value, attributes FROM ${database}.${table} WHERE ${filters.join(" AND ")} ORDER BY timestamp DESC, event_id DESC LIMIT {limit:UInt16} FORMAT JSON`;
  const url = new URL(env.CLICKHOUSE_URL);
  url.searchParams.set("query", query);
  const params: Record<string, string> = {
    param_organizationId: input.organizationId,
    param_projectId: input.projectId,
    param_from: input.from,
    param_to: input.to,
    param_limit: String(input.limit + 1),
  };
  if (input.environmentId) params.param_environmentId = input.environmentId;
  if (input.eventType) params.param_eventType = input.eventType;
  if (input.cursor) {
    params.param_cursorTimestamp = input.cursor.timestamp;
    params.param_cursorEventId = input.cursor.eventId;
  }
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const headers = new Headers();
  if (env.CLICKHOUSE_TOKEN) headers.set("authorization", `Bearer ${env.CLICKHOUSE_TOKEN}`);
  else if (env.CLICKHOUSE_USERNAME || env.CLICKHOUSE_PASSWORD) {
    headers.set("authorization", "Basic " + btoa(`${env.CLICKHOUSE_USERNAME ?? "default"}:${env.CLICKHOUSE_PASSWORD ?? ""}`));
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    // Never forward ClickHouse's raw response body to the dashboard client.
    throw new Error(`ClickHouse query failed with status ${response.status}.`);
  }
  const result = await response.json() as { data?: T[] };
  if (!Array.isArray(result.data)) throw new Error("ClickHouse returned an invalid JSON result.");
  return result.data;
}

export type TelemetryOverview = {
  total: number;
  events: number;
  errors: number;
  logs: number;
  metrics: number;
  spans: number;
  lastEventAt: string | null;
};

export async function queryTelemetryOverview(
  env: TelemetryQueryBindings,
  input: Omit<TelemetryQuery, "limit" | "cursor" | "eventType">,
): Promise<TelemetryOverview> {
  if (!env.CLICKHOUSE_URL) throw new Error("CLICKHOUSE_URL is not configured.");
  const database = escapeIdentifier(env.CLICKHOUSE_DATABASE ?? "jerico");
  const table = escapeIdentifier(env.CLICKHOUSE_TABLE ?? "telemetry_events");
  const filters = [
    "organization_id = {organizationId:String}",
    "project_id = {projectId:String}",
    "timestamp >= parseDateTime64BestEffort({from:String}, 3, 'UTC')",
    "timestamp <= parseDateTime64BestEffort({to:String}, 3, 'UTC')",
  ];
  if (input.environmentId) filters.push("environment_id = {environmentId:String}");
  const query = `SELECT count() AS total, countIf(event_type = 'event') AS events, countIf(event_type = 'error') AS errors, countIf(event_type = 'log') AS logs, countIf(event_type = 'metric') AS metrics, countIf(event_type = 'span') AS spans, if(count() = 0, NULL, formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.%3fZ', 'UTC')) AS lastEventAt FROM ${database}.${table} WHERE ${filters.join(" AND ")} FORMAT JSON`;
  const url = new URL(env.CLICKHOUSE_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("param_organizationId", input.organizationId);
  url.searchParams.set("param_projectId", input.projectId);
  url.searchParams.set("param_from", input.from);
  url.searchParams.set("param_to", input.to);
  if (input.environmentId) url.searchParams.set("param_environmentId", input.environmentId);
  const headers = new Headers();
  if (env.CLICKHOUSE_TOKEN) headers.set("authorization", `Bearer ${env.CLICKHOUSE_TOKEN}`);
  else if (env.CLICKHOUSE_USERNAME || env.CLICKHOUSE_PASSWORD) {
    headers.set("authorization", "Basic " + btoa(`${env.CLICKHOUSE_USERNAME ?? "default"}:${env.CLICKHOUSE_PASSWORD ?? ""}`));
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`ClickHouse overview query failed with status ${response.status}.`);
  const result = await response.json() as { data?: Array<Record<string, unknown>> };
  const row = result.data?.[0];
  if (!row) throw new Error("ClickHouse returned an empty overview result.");
  const count = (value: unknown) => Number(value ?? 0);
  return {
    total: count(row.total),
    events: count(row.events),
    errors: count(row.errors),
    logs: count(row.logs),
    metrics: count(row.metrics),
    spans: count(row.spans),
    lastEventAt: typeof row.lastEventAt === "string" ? row.lastEventAt : null,
  };
}


export type TelemetryErrorGroup = {
  fingerprint: string;
  name: string;
  latestMessage: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  latestEventId: string;
  latestStack: string;
};

export async function queryTelemetryErrorGroups(
  env: TelemetryQueryBindings,
  input: Omit<TelemetryQuery, "cursor" | "eventType">,
): Promise<TelemetryErrorGroup[]> {
  if (!env.CLICKHOUSE_URL) throw new Error("CLICKHOUSE_URL is not configured.");
  const database = escapeIdentifier(env.CLICKHOUSE_DATABASE ?? "jerico");
  const table = escapeIdentifier(env.CLICKHOUSE_TABLE ?? "telemetry_events");
  const filters = [
    "organization_id = {organizationId:String}",
    "project_id = {projectId:String}",
    "event_type = 'error'",
    "timestamp >= parseDateTime64BestEffort({from:String}, 3, 'UTC')",
    "timestamp <= parseDateTime64BestEffort({to:String}, 3, 'UTC')",
  ];
  if (input.environmentId) filters.push("environment_id = {environmentId:String}");
  const query = `SELECT toString(cityHash64(name, message)) AS fingerprint, name, argMax(message, (timestamp, event_id)) AS latestMessage, count() AS occurrences, formatDateTime(min(timestamp), '%Y-%m-%dT%H:%i:%S.%3fZ', 'UTC') AS firstSeen, formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.%3fZ', 'UTC') AS lastSeen, argMax(event_id, (timestamp, event_id)) AS latestEventId, JSONExtractString(argMax(attributes, (timestamp, event_id)), 'stack') AS latestStack FROM ${database}.${table} WHERE ${filters.join(" AND ")} GROUP BY fingerprint, name ORDER BY max(timestamp) DESC LIMIT {limit:UInt16} FORMAT JSON`;
  const url = new URL(env.CLICKHOUSE_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("param_organizationId", input.organizationId);
  url.searchParams.set("param_projectId", input.projectId);
  url.searchParams.set("param_from", input.from);
  url.searchParams.set("param_to", input.to);
  url.searchParams.set("param_limit", String(input.limit));
  if (input.environmentId) url.searchParams.set("param_environmentId", input.environmentId);
  const headers = new Headers();
  if (env.CLICKHOUSE_TOKEN) headers.set("authorization", `Bearer ${env.CLICKHOUSE_TOKEN}`);
  else if (env.CLICKHOUSE_USERNAME || env.CLICKHOUSE_PASSWORD) {
    headers.set("authorization", "Basic " + btoa(`${env.CLICKHOUSE_USERNAME ?? "default"}:${env.CLICKHOUSE_PASSWORD ?? ""}`));
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`ClickHouse error-group query failed with status ${response.status}.`);
  const result = await response.json() as { data?: Array<Record<string, unknown>> };
  if (!Array.isArray(result.data)) throw new Error("ClickHouse returned an invalid error-group result.");
  return result.data.map((row) => ({
    fingerprint: String(row.fingerprint),
    name: String(row.name ?? "Error"),
    latestMessage: String(row.latestMessage ?? ""),
    occurrences: Number(row.occurrences ?? 0),
    firstSeen: String(row.firstSeen),
    lastSeen: String(row.lastSeen),
    latestEventId: String(row.latestEventId),
    latestStack: String(row.latestStack ?? ""),
  }));
}

export type TelemetryMetricPoint = { timestamp: string; average: number; minimum: number; maximum: number; samples: number };
export type TelemetryMetricSeries = { name: string; points: TelemetryMetricPoint[] };

export async function queryTelemetryMetricSeries(
  env: TelemetryQueryBindings,
  input: Omit<TelemetryQuery, "limit" | "cursor" | "eventType"> & { bucketMinutes: 1 | 15 | 60 | 360 },
): Promise<TelemetryMetricSeries[]> {
  if (!env.CLICKHOUSE_URL) throw new Error("CLICKHOUSE_URL is not configured.");
  const database = escapeIdentifier(env.CLICKHOUSE_DATABASE ?? "jerico");
  const table = escapeIdentifier(env.CLICKHOUSE_TABLE ?? "telemetry_events");
  const filters = [
    "organization_id = {organizationId:String}",
    "project_id = {projectId:String}",
    "event_type = 'metric'",
    "isNotNull(value)",
    "timestamp >= parseDateTime64BestEffort({from:String}, 3, 'UTC')",
    "timestamp <= parseDateTime64BestEffort({to:String}, 3, 'UTC')",
  ];
  if (input.environmentId) filters.push("environment_id = {environmentId:String}");
  const query = `SELECT name, formatDateTime(toStartOfInterval(timestamp, INTERVAL ${input.bucketMinutes} MINUTE), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS timestamp, avg(value) AS average, min(value) AS minimum, max(value) AS maximum, count() AS samples FROM ${database}.${table} WHERE ${filters.join(" AND ")} AND name IN (SELECT name FROM ${database}.${table} WHERE ${filters.join(" AND ")} GROUP BY name ORDER BY count() DESC LIMIT 8) GROUP BY name, toStartOfInterval(timestamp, INTERVAL ${input.bucketMinutes} MINUTE) ORDER BY name ASC, timestamp ASC LIMIT 1200 FORMAT JSON`;
  const url = new URL(env.CLICKHOUSE_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("param_organizationId", input.organizationId);
  url.searchParams.set("param_projectId", input.projectId);
  url.searchParams.set("param_from", input.from);
  url.searchParams.set("param_to", input.to);
  if (input.environmentId) url.searchParams.set("param_environmentId", input.environmentId);
  const headers = new Headers();
  if (env.CLICKHOUSE_TOKEN) headers.set("authorization", `Bearer ${env.CLICKHOUSE_TOKEN}`);
  else if (env.CLICKHOUSE_USERNAME || env.CLICKHOUSE_PASSWORD) {
    headers.set("authorization", "Basic " + btoa(`${env.CLICKHOUSE_USERNAME ?? "default"}:${env.CLICKHOUSE_PASSWORD ?? ""}`));
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`ClickHouse metric-series query failed with status ${response.status}.`);
  const result = await response.json() as { data?: Array<Record<string, unknown>> };
  if (!Array.isArray(result.data)) throw new Error("ClickHouse returned an invalid metric-series result.");
  const grouped = new Map<string, TelemetryMetricPoint[]>();
  for (const row of result.data) {
    const name = String(row.name ?? "Unnamed metric");
    const points = grouped.get(name) ?? [];
    points.push({
      timestamp: String(row.timestamp),
      average: Number(row.average),
      minimum: Number(row.minimum),
      maximum: Number(row.maximum),
      samples: Number(row.samples),
    });
    grouped.set(name, points);
  }
  return Array.from(grouped, ([name, points]) => ({ name, points }));
}
