import { describe, expect, it } from "vitest";
import { createEnvironmentSchema, createProductSchema, createProjectSchema } from "./index";

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
  it("defaults environments to non-production", () => {
    expect(createEnvironmentSchema.parse({ name: "Development" }).isProduction).toBe(false);
  });
});
