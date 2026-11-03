import { afterEach, describe, expect, it, vi } from "vitest";
import { buildUptimeDeadLetterResult, escapeIdentifier, isValidNotificationMessage, toRow, writeToClickHouse } from "./index";

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

  it("derives a stable fallback ID for pre-upgrade queued events", () => {
    const event = { type: "event" as const, name: "legacy.signup" };
    const first = toRow(message, event, 2);
    const redelivery = toRow(message, event, 2);
    expect(first.event_id).toBe("legacy:req_123:2");
    expect(redelivery.event_id).toBe(first.event_id);
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
    expect(init?.signal).toBeDefined();
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("max_execution_time")).toBe("8");
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

describe("uptime dead-letter results", () => {
  it("creates a terminal down result with a stable check ID", () => {
    const result = buildUptimeDeadLetterResult({
      schemaVersion: 1,
      type: "uptime.probe",
      checkId: "550e8400-e29b-41d4-a716-446655440000",
      monitorId: "monitor-a",
      organizationId: "org-a",
      projectId: "project-a",
      url: "https://status.example.com",
      method: "GET",
      timeoutMs: 10000,
      expectedStatusCode: 200,
    }, "2026-11-03T14:00:00.000Z");
    expect(result).toMatchObject({
      checkId: "550e8400-e29b-41d4-a716-446655440000",
      monitorId: "monitor-a",
      status: "down",
      statusCode: null,
      responseTimeMs: null,
      errorCode: "network_error",
      checkedAt: "2026-11-03T14:00:00.000Z",
    });
  });
});

describe("notification queue contract", () => {
  it("accepts bounded email delivery messages", () => {
    expect(isValidNotificationMessage({
      schemaVersion: 1, type: "notification.email", deliveryId: "550e8400-e29b-41d4-a716-446655440000",
      enqueueToken: "550e8400-e29b-41d4-a716-446655440001", to: "ops@example.com", subject: "Incident opened", text: "An incident needs attention.",
    })).toBe(true);
  });
  it("accepts bounded webhook verification and delivery messages", () => {
    expect(isValidNotificationMessage({
      schemaVersion: 1, type: "notification.webhook.verify",
      channelId: "550e8400-e29b-41d4-a716-446655440000",
      url: "https://hooks.example.com/jerico", challenge: "x".repeat(43),
    })).toBe(true);
    expect(isValidNotificationMessage({
      schemaVersion: 1, type: "notification.webhook",
      deliveryId: "550e8400-e29b-41d4-a716-446655440000",
      enqueueToken: "550e8400-e29b-41d4-a716-446655440001",
      url: "https://hooks.example.com/jerico",
      secretCiphertext: "c".repeat(48), secretIv: "i".repeat(16),
      eventType: "incident.opened", incidentId: "incident-a", projectId: "project-a",
      title: "High error rate", triggerValue: 12, occurredAt: "2026-11-03T10:00:00.000Z",
    })).toBe(true);
  });
  it("accepts legacy webhook deliveries without enqueue tokens", () => {
    expect(isValidNotificationMessage({
      schemaVersion: 1, type: "notification.webhook",
      deliveryId: "550e8400-e29b-41d4-a716-446655440000",
      url: "https://hooks.example.com/jerico",
      secretCiphertext: "c".repeat(48), secretIv: "i".repeat(16),
      eventType: "incident.opened", incidentId: "incident-a", projectId: "project-a",
      title: "High error rate", triggerValue: 12, occurredAt: "2026-11-03T10:00:00.000Z",
    })).toBe(true);
  });

  it("rejects webhook messages targeting the probe worker or unsafe hosts", () => {
    const base = {
      schemaVersion: 1, type: "notification.webhook.verify",
      channelId: "550e8400-e29b-41d4-a716-446655440000",
      challenge: "x".repeat(43),
    };
    expect(isValidNotificationMessage({ ...base, url: "https://probe.example.com/hook" }, "probe.example.com")).toBe(false);
    expect(isValidNotificationMessage({ ...base, url: "https://service.corp/hook" })).toBe(false);
  });
  it("rejects unsafe or oversized queue payloads", () => {
    expect(isValidNotificationMessage({
      schemaVersion: 1, type: "notification.email", deliveryId: "not-a-uuid",
      to: "ops@example.com", subject: "Incident opened", text: "An incident needs attention.",
    })).toBe(false);
    expect(isValidNotificationMessage({
      schemaVersion: 1, type: "notification.email", deliveryId: "550e8400-e29b-41d4-a716-446655440000",
      to: "not-an-email", subject: "Incident opened", text: "An incident needs attention.",
    })).toBe(false);
  });
});
