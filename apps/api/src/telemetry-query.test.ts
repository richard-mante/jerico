import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeTelemetryCursor, encodeTelemetryCursor, parseQueryLimit, parseTimeRange, queryTelemetry, queryTelemetryOverview } from "./telemetry-query";

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
});
