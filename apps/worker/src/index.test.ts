import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeIdentifier, toRow, writeToClickHouse } from "./index";

const message = {
  schemaVersion: 1 as const,
  requestId: "req_123",
  credentialId: "key_123",
  organizationId: "org_123",
  projectId: "project_123",
  environmentId: "env_123",
  acceptedAt: "2026-11-03T09:00:00.000Z",
  events: [],
};

describe("ClickHouse telemetry adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("derives tenant and project dimensions from the trusted queue envelope", () => {
    const row = toRow(message, {
      eventId: "evt_123",
      type: "error",
      name: "checkout.failed",
      message: "Payment failed",
      value: 2,
      attributes: { route: "/checkout" },
    });
    expect(row.event_id).toBe("evt_123");
    expect(row.organization_id).toBe("org_123");
    expect(row.project_id).toBe("project_123");
    expect(row.environment_id).toBe("env_123");
    expect(row.credential_id).toBe("key_123");
    expect(row.event_type).toBe("error");
  });

  it("rejects unsafe ClickHouse identifiers", () => {
    expect(escapeIdentifier("telemetry_events")).toBe("telemetry_events");
    expect(() => escapeIdentifier("events; DROP TABLE users")).toThrow();
  });

  it("writes JSONEachRow and sends the configured bearer token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    await writeToClickHouse({
      CLICKHOUSE_URL: "https://clickhouse.example",
      CLICKHOUSE_TOKEN: "test-token",
    }, [{
      ...message,
      events: [{ eventId: "evt_signup", type: "event", name: "signup" }],
    }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
    expect(String(init?.body)).toContain('"organization_id":"org_123"');
    expect(String(init?.body)).toContain('"name":"signup"');
  });

  it("surfaces ClickHouse write failures so queue delivery is retried", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(writeToClickHouse({
      CLICKHOUSE_URL: "https://clickhouse.example",
    }, [{ ...message, events: [{ type: "event", name: "signup" }] }])).rejects.toThrow("503");
  });
});
