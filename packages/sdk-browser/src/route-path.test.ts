import { describe, expect, it } from "vitest";
import { normalizeRoutePath, resolveRoutePath } from "./route-path";

describe("normalizeRoutePath", () => {
  it("replaces UUID, long hex, and long numeric identifiers", () => {
    expect(normalizeRoutePath("/users/123456/orders/550e8400-e29b-41d4-a716-446655440000/items/abcdef1234567890"))
      .toBe("/users/:id/orders/:id/items/:id");
  });

  it("preserves ordinary static segments and short numeric segments", () => {
    expect(normalizeRoutePath("/docs/2026/changelog")).toBe("/docs/2026/changelog");
  });

  it("removes query strings and fragments", () => {
    expect(normalizeRoutePath("/checkout/123456?token=secret#payment")).toBe("/checkout/:id");
  });

  it("bounds segment and total path lengths", () => {
    expect(normalizeRoutePath("/" + "a".repeat(700))).toHaveLength(129);
    expect(normalizeRoutePath("/" + Array.from({ length: 10 }, () => "segment".repeat(20)).join("/"))).toHaveLength(512);
  });
});

describe("resolveRoutePath", () => {
  it("uses an application route template when supplied", () => {
    expect(resolveRoutePath("/users/123456", () => "/users/:userId")).toBe("/users/:userId");
  });

  it("falls back to normalized pathname when the resolver fails", () => {
    expect(resolveRoutePath("/orders/123456", () => { throw new Error("router unavailable"); })).toBe("/orders/:id");
  });
});
