import { describe, expect, it } from "vitest";
import { createAlertRuleSchema, updateAlertRuleSchema, createNotificationChannelSchema, verifyNotificationChannelSchema, notificationDeliveryResultSchema, createWebhookNotificationChannelSchema, webhookVerificationResultSchema, isAllowedWebhookUrl, createEnvironmentSchema, createIngestionKeySchema, createProductSchema, createProjectSchema, createUptimeMonitorSchema, updateUptimeMonitorSchema, uptimeProbeResultSchema } from "./index";

describe("resource request contracts", () => {
  it("accepts a standalone project without a product", () => {
    expect(createProjectSchema.safeParse({ name: "Public API", platform: "server" }).success).toBe(true);
  });
  it("rejects invalid project platforms", () => {
    expect(createProjectSchema.safeParse({ name: "Public API", platform: "unknown" }).success).toBe(false);
  });
  it("rejects malformed slugs", () => {
    expect(createProductSchema.safeParse({ name: "Storefront", slug: "../admin" }).success).toBe(false);
  });
  it("accepts a named environment-scoped public or secret ingestion key", () => {
    expect(createIngestionKeySchema.safeParse({ name: "Browser production", environmentId: "env_123", keyType: "public" }).success).toBe(true);
    expect(createIngestionKeySchema.safeParse({ name: "Node production", environmentId: "env_123", keyType: "secret" }).success).toBe(true);
  });
  it("rejects invalid ingestion key types and missing environments", () => {
    expect(createIngestionKeySchema.safeParse({ name: "Bad key", environmentId: "env_123", keyType: "admin" }).success).toBe(false);
    expect(createIngestionKeySchema.safeParse({ name: "Missing environment", keyType: "public" }).success).toBe(false);
  });
  it("defaults environments to non-production", () => {
    expect(createEnvironmentSchema.parse({ name: "Development" }).isProduction).toBe(false);
  });
});

describe("uptime monitor contracts", () => {
  it("accepts public HTTP(S) endpoints and applies safe defaults", () => {
    expect(createUptimeMonitorSchema.parse({ name: "Main website", url: "https://status.example.com/health" })).toMatchObject({
      method: "GET", intervalSeconds: 60, timeoutMs: 10000, expectedStatusCode: 200, enabled: true,
    });
  });

  it("rejects non-HTTP protocols, credentials, private hosts, and unsupported ports", () => {
    expect(createUptimeMonitorSchema.safeParse({ name: "FTP monitor", url: "ftp://example.com/file" }).success).toBe(false);
    expect(createUptimeMonitorSchema.safeParse({ name: "Credential URL", url: "https://user:pass@example.com" }).success).toBe(false);
    expect(createUptimeMonitorSchema.safeParse({ name: "Localhost", url: "http://localhost/health" }).success).toBe(false);
    expect(createUptimeMonitorSchema.safeParse({ name: "Private IP", url: "http://10.0.0.1/health" }).success).toBe(false);
    expect(createUptimeMonitorSchema.safeParse({ name: "SSH port", url: "https://status.example.com:22/health" }).success).toBe(false);
  });

  it("bounds probe settings and requires a non-empty update", () => {
    expect(createUptimeMonitorSchema.safeParse({ name: "Too frequent", url: "https://example.com", intervalSeconds: 10 }).success).toBe(false);
    expect(createUptimeMonitorSchema.safeParse({ name: "Too slow", url: "https://example.com", timeoutMs: 60000 }).success).toBe(false);
    expect(updateUptimeMonitorSchema.safeParse({}).success).toBe(false);
    expect(updateUptimeMonitorSchema.safeParse({ enabled: false }).success).toBe(true);
  });
});

describe("internal uptime probe result contract", () => {
  it("accepts a bounded result envelope", () => {
    expect(uptimeProbeResultSchema.safeParse({
      checkId: "550e8400-e29b-41d4-a716-446655440000",
      monitorId: "monitor-a",
      organizationId: "org-a",
      projectId: "project-a",
      status: "down",
      statusCode: null,
      responseTimeMs: 10000,
      errorCode: "timeout",
      checkedAt: "2026-11-03T05:00:00.000Z",
    }).success).toBe(true);
  });

  it("rejects arbitrary error strings and invalid result identifiers", () => {
    expect(uptimeProbeResultSchema.safeParse({
      checkId: "not-a-uuid", monitorId: "monitor-a", organizationId: "org-a", projectId: "project-a",
      status: "down", statusCode: null, responseTimeMs: null, errorCode: "internal database password leaked",
      checkedAt: "2026-11-03T05:00:00.000Z",
    }).success).toBe(false);
  });
});


describe("alert rule contracts", () => {
  it("applies bounded defaults for an error-count alert", () => {
    expect(createAlertRuleSchema.parse({ name: "High error volume", metric: "error_count", threshold: 20 })).toMatchObject({
      comparison: "gte", windowSeconds: 300, consecutiveBreaches: 1, enabled: true,
    });
  });
  it("accepts uptime and response-time rules", () => {
    expect(createAlertRuleSchema.safeParse({ name: "Failed checks", metric: "uptime_down", threshold: 2 }).success).toBe(true);
    expect(createAlertRuleSchema.safeParse({ name: "Slow responses", metric: "response_time", threshold: 1500, windowSeconds: 900 }).success).toBe(true);
  });
  it("rejects unsupported metrics and unbounded thresholds", () => {
    expect(createAlertRuleSchema.safeParse({ name: "Unknown", metric: "cpu", threshold: 10 }).success).toBe(false);
    expect(createAlertRuleSchema.safeParse({ name: "Too many", metric: "error_count", threshold: 0 }).success).toBe(false);
    expect(createAlertRuleSchema.safeParse({ name: "Too frequent", metric: "error_count", threshold: 10, windowSeconds: 10 }).success).toBe(false);
    expect(createAlertRuleSchema.safeParse({ name: "Too many confirmations", metric: "error_count", threshold: 10, consecutiveBreaches: 11 }).success).toBe(false);
  });
  it("requires a non-empty partial update", () => {
    expect(updateAlertRuleSchema.safeParse({}).success).toBe(false);
    expect(updateAlertRuleSchema.safeParse({ enabled: false }).success).toBe(true);
  });
});

describe("email notification contracts", () => {
  it("normalizes a valid notification email", () => {
    expect(createNotificationChannelSchema.parse({ email: " Ops@Example.com " }).email).toBe("ops@example.com");
  });
  it("rejects malformed addresses and extra fields", () => {
    expect(createNotificationChannelSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(createNotificationChannelSchema.safeParse({ email: "ops@example.com", url: "https://example.com" }).success).toBe(false);
  });
  it("requires a bounded verification token", () => {
    expect(verifyNotificationChannelSchema.safeParse({ token: "v".repeat(43) }).success).toBe(true);
    expect(verifyNotificationChannelSchema.safeParse({ token: "short" }).success).toBe(false);
  });
  it("accepts delivery results only with safe failure codes", () => {
    expect(notificationDeliveryResultSchema.safeParse({ deliveryId: "550e8400-e29b-41d4-a716-446655440000", attemptId: "550e8400-e29b-41d4-a716-446655440001", enqueueAttempt: 1, queueAttempt: 1, status: "attempting" }).success).toBe(true);
    expect(notificationDeliveryResultSchema.safeParse({ deliveryId: "550e8400-e29b-41d4-a716-446655440000", attemptId: "550e8400-e29b-41d4-a716-446655440001", enqueueAttempt: 1, queueAttempt: 1, status: "sent", providerMessageId: "msg_123" }).success).toBe(true);
    expect(notificationDeliveryResultSchema.safeParse({ deliveryId: "550e8400-e29b-41d4-a716-446655440000", attemptId: "550e8400-e29b-41d4-a716-446655440001", enqueueAttempt: 1, queueAttempt: 1, status: "failed" }).success).toBe(false);
    expect(notificationDeliveryResultSchema.safeParse({ deliveryId: "550e8400-e29b-41d4-a716-446655440000", attemptId: "550e8400-e29b-41d4-a716-446655440001", enqueueAttempt: 1, queueAttempt: 1, status: "failed", errorCode: "private endpoint response" }).success).toBe(false);
    expect(notificationDeliveryResultSchema.safeParse({ deliveryId: "550e8400-e29b-41d4-a716-446655440000", status: "attempting" }).success).toBe(false);
  });
});

describe("webhook notification contracts", () => {
  it("accepts public HTTPS webhook endpoints", () => {
    expect(createWebhookNotificationChannelSchema.safeParse({ url: "https://hooks.example.com/jerico" }).success).toBe(true);
  });
  it("rejects local, IP-literal, insecure, credentialed, and redirected query targets", () => {
    for (const url of [
      "http://hooks.example.com/jerico",
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://192.168.1.10/hook",
      "https://[::1]/hook",
      "https://user:pass@hooks.example.com/hook",
      "https://hooks.example.com:8443/hook",
      "https://hooks.example.com/hook?token=secret",
      "https://hooks.example.com/hook#fragment",
      "https://service.internal/hook",
      "https://service.corp/hook",
      "https://metadata/hook",
      "https://service.private/hook",
      "https://service.onion/hook",
    ]) expect(isAllowedWebhookUrl(url)).toBe(false);
  });
  it("requires a safe error code for failed endpoint verification", () => {
    expect(webhookVerificationResultSchema.safeParse({
      channelId: "550e8400-e29b-41d4-a716-446655440000", challenge: "x".repeat(43), status: "verified",
    }).success).toBe(true);
    expect(webhookVerificationResultSchema.safeParse({
      channelId: "550e8400-e29b-41d4-a716-446655440000", challenge: "x".repeat(43), status: "failed",
    }).success).toBe(false);
  });
});
