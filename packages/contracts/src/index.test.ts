import { describe, expect, it } from "vitest";
import { createEnvironmentSchema, createIngestionKeySchema, createProductSchema, createProjectSchema, createUptimeMonitorSchema, updateUptimeMonitorSchema, uptimeProbeResultSchema } from "./index";

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
