import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeTelemetryCursor, encodeTelemetryCursor, parseQueryLimit, parseTimeRange, queryTelemetry, queryTelemetryErrorCount, queryTelemetryErrorGroups, queryTelemetryEventCatalogue, queryTelemetryEventSeries, queryTelemetryMetricSeries, queryTelemetryOverview, queryTelemetryRoutePerformance } from "./telemetry-query";

describe("telemetry query validation", () => {
  it("defaults to one hour and rejects ranges over 31 days", () => {
    const now = new Date("2026-11-03T12:00:00.000Z");
    expect(parseTimeRange(undefined, undefined, now)).toEqual({
      from: "2026-11-03T11:00:00.000Z",
      to: "2026-11-03T12:00:00.000Z",
    });
    expect(parseTimeRange("2026-09-01T00:00:00.000Z", "2026-11-03T12:00:00.000Z", now)).toBeNull();
  });

  it("rejects invalid, reversed, and future ranges", () => {
    const now = new Date("2026-11-03T12:00:00.000Z");
    expect(parseTimeRange("invalid", undefined, now)).toBeNull();
    expect(parseTimeRange("2026-11-03T13:00:00.000Z", "2026-11-03T12:00:00.000Z", now)).toBeNull();
    expect(parseTimeRange(undefined, "2026-11-04T12:00:00.000Z", now)).toBeNull();
  });

  it("bounds page sizes", () => {
    expect(parseQueryLimit(undefined)).toBe(50);
    expect(parseQueryLimit("100")).toBe(100);
    expect(parseQueryLimit("0")).toBeNull();
    expect(parseQueryLimit("101")).toBeNull();
    expect(parseQueryLimit("1e2")).toBeNull();
  });

  it("round-trips opaque cursors and rejects malformed values", () => {
    const cursor = { timestamp: "2026-11-03T11:59:00.123Z", eventId: "event-1" };
    expect(decodeTelemetryCursor(encodeTelemetryCursor(cursor))).toEqual(cursor);
    expect(decodeTelemetryCursor("%%%")).toBeNull();
  });
});

describe("ClickHouse query adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("binds tenant, project, environment, and event type as query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await queryTelemetry(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      {
        organizationId: "org-a",
        projectId: "project-a",
        environmentId: "env-a",
        from: "2026-11-03T10:00:00.000Z",
        to: "2026-11-03T11:00:00.000Z",
        limit: 50,
        eventType: "error",
      },
    );
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get("param_organizationId")).toBe("org-a");
    expect(parsedUrl.searchParams.get("param_projectId")).toBe("project-a");
    expect(parsedUrl.searchParams.get("param_environmentId")).toBe("env-a");
    expect(parsedUrl.searchParams.get("param_eventType")).toBe("error");
    expect(parsedUrl.searchParams.get("param_limit")).toBe("51");
    expect(parsedUrl.searchParams.get("max_execution_time")).toBe("8");
    expect(init.signal).toBeDefined();
    expect(parsedUrl.searchParams.get("query")).toContain("organization_id = {organizationId:String}");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-token");
  });

  it("queries project overview counts with the same tenant and environment filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{
      total: "12", events: "5", errors: "2", logs: "3", metrics: "1", spans: "1", lastEventAt: "2026-11-03T11:00:00.000Z",
    }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await queryTelemetryOverview(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", environmentId: "env-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z" },
    );
    expect(result).toEqual({
      total: 12, events: 5, errors: 2, logs: 3, metrics: 1, spans: 1, lastEventAt: "2026-11-03T11:00:00.000Z",
    });
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(new URL(url).searchParams.get("param_organizationId")).toBe("org-a");
    expect(new URL(url).searchParams.get("param_environmentId")).toBe("env-a");
  });

  it("rejects unsafe ClickHouse identifiers before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(queryTelemetry(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TABLE: "events; DROP TABLE users" },
      { organizationId: "org", projectId: "project", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z", limit: 10 },
    )).rejects.toThrow("Invalid ClickHouse identifier");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("groups errors within the same tenant, project, and environment scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{
      fingerprint: "12345", name: "TypeError", latestMessage: "Cannot read property", occurrences: "4",
      firstSeen: "2026-11-03T10:00:00.000Z", lastSeen: "2026-11-03T11:00:00.000Z", latestEventId: "event-4", latestStack: "TypeError: stack",
    }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const groups = await queryTelemetryErrorGroups(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", environmentId: "env-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z", limit: 25 },
    );
    expect(groups[0]).toEqual({
      fingerprint: "12345", name: "TypeError", latestMessage: "Cannot read property", occurrences: 4,
      firstSeen: "2026-11-03T10:00:00.000Z", lastSeen: "2026-11-03T11:00:00.000Z", latestEventId: "event-4", latestStack: "TypeError: stack",
    });
    const [url] = fetchMock.mock.calls[0] as [URL];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("param_organizationId")).toBe("org-a");
    expect(parsed.searchParams.get("param_projectId")).toBe("project-a");
    expect(parsed.searchParams.get("param_environmentId")).toBe("env-a");
    expect(parsed.searchParams.get("query")).toContain("GROUP BY fingerprint, name");
    expect(parsed.searchParams.get("query")).toContain("event_type = 'error'");
  });

  it("aggregates metric values into tenant-scoped time buckets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{
      name: "web.vitals.lcp", timestamp: "2026-11-03T10:15:00.000Z", average: "2400", minimum: "1900", maximum: "3100", p50: "2300", p75: "2500", p95: "3000", samples: "8", unit: "ms", rating: "good",
    }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const series = await queryTelemetryMetricSeries(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", environmentId: "env-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z", bucketMinutes: 15 },
    );
    expect(series).toEqual([{ name: "web.vitals.lcp", points: [{ timestamp: "2026-11-03T10:15:00.000Z", average: 2400, minimum: 1900, maximum: 3100, p50: 2300, p75: 2500, p95: 3000, samples: 8, unit: "ms", rating: "good" }] }]);
    const [url] = fetchMock.mock.calls[0] as [URL];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("param_organizationId")).toBe("org-a");
    expect(parsed.searchParams.get("param_projectId")).toBe("project-a");
    expect(parsed.searchParams.get("param_environmentId")).toBe("env-a");
    expect(parsed.searchParams.get("query")).toContain("event_type = 'metric'");
    expect(parsed.searchParams.get("query")).toContain("INTERVAL 15 MINUTE");
    expect(parsed.searchParams.get("query")).toContain("quantileTDigest(0.50)(value)");
    expect(parsed.searchParams.get("query")).toContain("quantileTDigest(0.95)(value)");
    expect(parsed.searchParams.get("query")).toContain("JSONExtractString(attributes, 'rating')");
  });
  it("binds structured log severity as a ClickHouse query parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await queryTelemetry(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z", limit: 10, eventType: "log", logLevel: "warn" },
    );
    const [url] = fetchMock.mock.calls[0] as [URL];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("param_logLevel")).toBe("warn");
    expect(parsed.searchParams.get("query")).toContain("JSONExtractString(attributes");
    expect(parsed.searchParams.get("query")).toContain("{logLevel:String}");
  });
  it("returns a tenant-scoped top event catalogue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{
      name: "checkout.completed", occurrences: "27", lastSeen: "2026-11-03T11:00:00.000Z", latestEventId: "event-27", latestMessage: "Checkout completed", latestAttributes: "{\"cartId\":\"cart-1\"}",
    }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const catalogue = await queryTelemetryEventCatalogue(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", environmentId: "env-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z" },
    );
    expect(catalogue).toEqual([{ name: "checkout.completed", occurrences: 27, lastSeen: "2026-11-03T11:00:00.000Z", latestEventId: "event-27", latestMessage: "Checkout completed", latestAttributes: "{\"cartId\":\"cart-1\"}" }]);
    const [url] = fetchMock.mock.calls[0] as [URL];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("param_organizationId")).toBe("org-a");
    expect(parsed.searchParams.get("param_projectId")).toBe("project-a");
    expect(parsed.searchParams.get("param_environmentId")).toBe("env-a");
    expect(parsed.searchParams.get("query")).toContain("event_type =");
    expect(parsed.searchParams.get("query")).toContain("LIMIT 100");
  });
  it("aggregates event occurrences into tenant-scoped time buckets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{
      name: "checkout.completed", timestamp: "2026-11-03T10:15:00.000Z", occurrences: "9",
    }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const series = await queryTelemetryEventSeries(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", environmentId: "env-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z", bucketMinutes: 15 },
    );
    expect(series).toEqual([{ name: "checkout.completed", points: [{ timestamp: "2026-11-03T10:15:00.000Z", occurrences: 9 }] }]);
    const [url] = fetchMock.mock.calls[0] as [URL];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("param_organizationId")).toBe("org-a");
    expect(parsed.searchParams.get("param_projectId")).toBe("project-a");
    expect(parsed.searchParams.get("param_environmentId")).toBe("env-a");
    expect(parsed.searchParams.get("query")).toContain("INTERVAL 15 MINUTE");
    expect(parsed.searchParams.get("query")).toContain("LIMIT 8");
  });
  it("filters error occurrences by a bound group fingerprint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await queryTelemetry(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z", limit: 20, eventType: "error", errorFingerprint: "123456789" },
    );
    const [url] = fetchMock.mock.calls[0] as [URL];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("param_errorFingerprint")).toBe("123456789");
    expect(parsed.searchParams.get("query")).toContain("cityHash64(name, message)");
    expect(parsed.searchParams.get("query")).toContain("{errorFingerprint:String}");
  });
  it("filters span queries by a bound trace ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await queryTelemetry(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z", limit: 100, eventType: "span", traceId: "trace-abc" },
    );
    const [url] = fetchMock.mock.calls[0] as [URL];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("param_traceId")).toBe("trace-abc");
    expect(parsed.searchParams.get("query")).toContain("JSONExtractString(attributes, 'traceId')");
    expect(parsed.searchParams.get("query")).toContain("{traceId:String}");
    expect(parsed.searchParams.get("param_eventType")).toBe("span");
  });

  it("groups allowlisted Web Vitals by tenant-scoped route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { path: "/checkout", name: "web.vitals.lcp", samples: "12", p75: "2400", p95: "3800", unit: "ms", rating: "needs-improvement" },
      { path: "/checkout", name: "web.vitals.cls", samples: "12", p75: "0.08", p95: "0.18", unit: "score", rating: "good" },
    ] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const routes = await queryTelemetryRoutePerformance(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", environmentId: "env-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z" },
    );
    expect(routes).toEqual([{
      path: "/checkout",
      metrics: [
        { name: "web.vitals.lcp", samples: 12, p75: 2400, p95: 3800, unit: "ms", rating: "needs-improvement" },
        { name: "web.vitals.cls", samples: 12, p75: 0.08, p95: 0.18, unit: "score", rating: "good" },
      ],
    }]);
    const [url] = fetchMock.mock.calls[0] as [URL];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("param_organizationId")).toBe("org-a");
    expect(parsed.searchParams.get("param_projectId")).toBe("project-a");
    expect(parsed.searchParams.get("param_environmentId")).toBe("env-a");
    expect(parsed.searchParams.get("query")).toContain("name IN ('web.vitals.lcp'");
    expect(parsed.searchParams.get("query")).toContain("JSONExtractString(attributes, 'path')");
    expect(parsed.searchParams.get("query")).toContain("quantileTDigest(0.95)(value)");
  });

});

describe("ClickHouse ReplacingMergeTree deduplication", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forces FINAL on every table read, including nested series subqueries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{}] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" };
    const range = {
      organizationId: "org-a",
      projectId: "project-a",
      from: "2026-11-03T10:00:00.000Z",
      to: "2026-11-03T11:00:00.000Z",
    };

    await queryTelemetry(env, { ...range, limit: 10 });
    await queryTelemetryOverview(env, range);
    await queryTelemetryErrorGroups(env, { ...range, limit: 10 });
    await queryTelemetryMetricSeries(env, { ...range, bucketMinutes: 15 });
    await queryTelemetryEventCatalogue(env, range);
    await queryTelemetryEventSeries(env, { ...range, bucketMinutes: 15 });
    await queryTelemetryRoutePerformance(env, range);
    await queryTelemetryErrorCount(env, range);

    for (const [url] of fetchMock.mock.calls as Array<[URL]>) {
      const query = new URL(url).searchParams.get("query") ?? "";
      const tableReads = query.match(/FROM jerico\.telemetry_events/g) ?? [];
      const finalReads = query.match(/FROM jerico\.telemetry_events FINAL/g) ?? [];
      expect(tableReads.length).toBeGreaterThan(0);
      expect(finalReads).toHaveLength(tableReads.length);
    }
  });
});

describe("alert metric query", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("counts only errors in the requested organization and project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ total: "17" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(queryTelemetryErrorCount(
      { CLICKHOUSE_URL: "https://clickhouse.example", CLICKHOUSE_TOKEN: "test-token" },
      { organizationId: "org-a", projectId: "project-a", from: "2026-11-03T10:00:00.000Z", to: "2026-11-03T11:00:00.000Z" },
    )).resolves.toBe(17);
    const [url] = fetchMock.mock.calls[0] as [URL];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("param_organizationId")).toBe("org-a");
    expect(parsed.searchParams.get("param_projectId")).toBe("project-a");
    expect(parsed.searchParams.get("query")).toContain("event_type = 'error'");
  });
});
