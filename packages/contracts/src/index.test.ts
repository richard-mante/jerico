import { describe, expect, it } from "vitest";
import { createEnvironmentSchema, createIngestionKeySchema, createProductSchema, createProjectSchema } from "./index";

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
