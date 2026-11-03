import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { queryTelemetry, queryTelemetryErrorGroups, queryTelemetryEventCatalogue, queryTelemetryEventSeries, queryTelemetryMetricSeries, queryTelemetryOverview, queryTelemetryRoutePerformance } from "./telemetry-query";
import type { TelemetryQueryBindings } from "./telemetry-query";

const testUrl = process.env.CLICKHOUSE_TEST_URL;
const database = process.env.CLICKHOUSE_TEST_DATABASE ?? "jerico";
const username = process.env.CLICKHOUSE_TEST_USERNAME ?? "default";
const password = process.env.CLICKHOUSE_TEST_PASSWORD ?? "";
const token = process.env.CLICKHOUSE_TEST_TOKEN;
const table = "jerico_integration_" + crypto.randomUUID().replaceAll("-", "");
const organizationId = crypto.randomUUID();
const projectId = crypto.randomUUID();
const environmentId = crypto.randomUUID();
const now = Date.now();
const from = new Date(now - 60 * 60 * 1000).toISOString();
const to = new Date(now + 60 * 1000).toISOString();

function authHeaders() {
  const headers = new Headers();
  if (token) headers.set("authorization", "Bearer " + token);
  else if (username || password) headers.set("authorization", "Basic " + btoa(username + ":" + password));
  return headers;
}

async function execute(sql: string, body?: string) {
  if (!testUrl) throw new Error("CLICKHOUSE_TEST_URL is required.");
  const url = new URL(testUrl);
  url.searchParams.set("database", database);
  const response = await fetch(url, { method: "POST", headers: authHeaders(), body: body === undefined ? sql : body });
  if (!response.ok) throw new Error("ClickHouse integration setup failed (" + response.status + "): " + await response.text());
  return response;
}

const bindings: TelemetryQueryBindings = {
  CLICKHOUSE_URL: testUrl,
  CLICKHOUSE_DATABASE: database,
  CLICKHOUSE_TABLE: table,
  CLICKHOUSE_USERNAME: username,
  CLICKHOUSE_PASSWORD: password,
  CLICKHOUSE_TOKEN: token,
};

describe.skipIf(!testUrl)("ClickHouse telemetry query integration", () => {
  beforeAll(async () => {
    await execute("CREATE TABLE " + database + "." + table + " (" +
      "event_id String, timestamp DateTime64(3, 'UTC'), accepted_at DateTime64(3, 'UTC'), " +
      "organization_id String, project_id String, environment_id String, credential_id String, request_id String, " +
      "event_type LowCardinality(String), name String, message String, value Nullable(Float64), attributes String" +
      ") ENGINE = ReplacingMergeTree ORDER BY (organization_id, project_id, environment_id, timestamp, event_type, event_id)");
    const timestamp = (offset: number) => new Date(now + offset).toISOString().replace("T", " ").replace("Z", "");
    const rows = [
      { event_id: "event-1", timestamp: timestamp(-30000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-1", event_type: "event", name: "checkout.completed", message: "Checkout completed", value: null, attributes: JSON.stringify({ source: "integration" }) },
      { event_id: "event-2", timestamp: timestamp(-20000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-2", event_type: "event", name: "checkout.completed", message: "Checkout completed again", value: null, attributes: JSON.stringify({ source: "integration", attempt: 2 }) },
      // Same ReplacingMergeTree sorting key: read-time FINAL must collapse this retry.
      { event_id: "event-1", timestamp: timestamp(-30000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-1-retry", event_type: "event", name: "checkout.completed", message: "Duplicate delivery of event-1", value: null, attributes: JSON.stringify({ source: "integration", retry: true }) },
      { event_id: "error-1", timestamp: timestamp(-15000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-3", event_type: "error", name: "TypeError", message: "Cannot read property", value: null, attributes: JSON.stringify({ stack: "TypeError: first stack" }) },
      { event_id: "error-2", timestamp: timestamp(-10000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-4", event_type: "error", name: "TypeError", message: "Cannot read property", value: null, attributes: JSON.stringify({ stack: "TypeError: latest stack" }) },
      { event_id: "error-2", timestamp: timestamp(-10000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-4-retry", event_type: "error", name: "TypeError", message: "Duplicate error delivery", value: null, attributes: JSON.stringify({ stack: "TypeError: latest stack" }) },
      { event_id: "log-1", timestamp: timestamp(-9000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-5", event_type: "log", name: "api.request", message: "Slow request", value: null, attributes: JSON.stringify({ level: "warn" }) },
      { event_id: "metric-1", timestamp: timestamp(-8000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-6", event_type: "metric", name: "http.request.duration", message: "", value: 100, attributes: JSON.stringify({ unit: "ms", rating: "good" }) },
      { event_id: "metric-2", timestamp: timestamp(-7000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-7", event_type: "metric", name: "http.request.duration", message: "", value: 101, attributes: JSON.stringify({ unit: "ms", rating: "good" }) },
      { event_id: "metric-2", timestamp: timestamp(-7000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-7-retry", event_type: "metric", name: "http.request.duration", message: "", value: 101, attributes: JSON.stringify({ unit: "ms", rating: "good", retry: true }) },
      { event_id: "vital-lcp-1", timestamp: timestamp(-6500), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-9", event_type: "metric", name: "web.vitals.lcp", message: "", value: 2200, attributes: JSON.stringify({ path: "/checkout", unit: "ms", rating: "good" }) },
      { event_id: "vital-cls-1", timestamp: timestamp(-6400), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-10", event_type: "metric", name: "web.vitals.cls", message: "", value: 0.08, attributes: JSON.stringify({ path: "/checkout", unit: "score", rating: "good" }) },
      { event_id: "span-1", timestamp: timestamp(-6000), accepted_at: timestamp(0), organization_id: organizationId, project_id: projectId, environment_id: environmentId, credential_id: "cred", request_id: "req-8", event_type: "span", name: "http.request", message: "", value: 20, attributes: JSON.stringify({ traceId: "trace-1", spanId: "span-1" }) },
    ];
    await execute("INSERT INTO " + database + "." + table + " FORMAT JSONEachRow", rows.map((row) => JSON.stringify(row)).join("\n"));
  });

  afterAll(async () => {
    if (testUrl) await execute("DROP TABLE IF EXISTS " + database + "." + table);
  });

  it("runs overview, grouped errors, and fingerprint occurrence queries against ClickHouse", async () => {
    const overview = await queryTelemetryOverview(bindings, { organizationId, projectId, environmentId, from, to });
    expect(overview).toMatchObject({ total: 10, events: 2, errors: 2, logs: 1, metrics: 4, spans: 1 });
    const groups = await queryTelemetryErrorGroups(bindings, { organizationId, projectId, environmentId, from, to, limit: 20 });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "TypeError", occurrences: 2, latestStack: "TypeError: latest stack" });
    const occurrences = await queryTelemetry(bindings, { organizationId, projectId, environmentId, from, to, limit: 20, eventType: "error", errorFingerprint: groups[0].fingerprint });
    expect(occurrences).toHaveLength(2);
  });

  it("runs event catalogue and event-series queries against ClickHouse", async () => {
    const catalogue = await queryTelemetryEventCatalogue(bindings, { organizationId, projectId, environmentId, from, to });
    expect(catalogue[0]).toMatchObject({ name: "checkout.completed", occurrences: 2, latestMessage: "Checkout completed again" });
    expect(catalogue[0].latestAttributes).toContain("attempt");
    const series = await queryTelemetryEventSeries(bindings, { organizationId, projectId, environmentId, from, to, bucketMinutes: 15 });
    expect(series.find((item) => item.name === "checkout.completed")?.points.reduce((sum, point) => sum + point.occurrences, 0)).toBe(2);
  });

  it("runs metric aggregation and structured log filters against ClickHouse", async () => {
    const metrics = await queryTelemetryMetricSeries(bindings, { organizationId, projectId, environmentId, from, to, bucketMinutes: 15 });
    expect(metrics.find((item) => item.name === "http.request.duration")?.points[0]).toMatchObject({ average: 100.5, minimum: 100, maximum: 101, samples: 2, unit: "ms", rating: "good" });
    const percentilePoint = metrics.find((item) => item.name === "http.request.duration")?.points[0];
    expect(percentilePoint?.p50).toBeGreaterThanOrEqual(100);
    expect(percentilePoint?.p95).toBeLessThanOrEqual(101);
    const logs = await queryTelemetry(bindings, { organizationId, projectId, environmentId, from, to, limit: 20, eventType: "log", logLevel: "warn" });
    expect(logs).toHaveLength(1);
    expect(logs[0].name).toBe("api.request");
  });
  it("retrieves all spans belonging to one trace independently of the dashboard page", async () => {
    const spans = await queryTelemetry(bindings, {
      organizationId, projectId, environmentId, from, to, limit: 100, eventType: "span", traceId: "trace-1",
    });
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ eventId: "span-1", eventType: "span", name: "http.request" });
  });

  it("runs tenant-scoped route performance aggregation against ClickHouse", async () => {
    const routes = await queryTelemetryRoutePerformance(bindings, { organizationId, projectId, environmentId, from, to });
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/checkout");
    expect(routes[0].metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "web.vitals.lcp", samples: 1, unit: "ms", rating: "good" }),
      expect.objectContaining({ name: "web.vitals.cls", samples: 1, unit: "score", rating: "good" }),
    ]));
  });

});
