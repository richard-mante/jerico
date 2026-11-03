import { describe, expect, it } from "vitest";
import { canonicalJson, createStableEventId, hashTelemetryRequest, isValidIdempotencyKey } from "./idempotency";

describe("ingestion idempotency helpers", () => {
  it("canonicalizes object key order", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });

  it("hashes equivalent payloads consistently", async () => {
    await expect(hashTelemetryRequest({ events: [{ name: "signup", type: "event" }] }))
      .resolves.toBe(await hashTelemetryRequest({ events: [{ type: "event", name: "signup" }] }));
  });

  it("derives stable event IDs for the same idempotent request", async () => {
    const first = await createStableEventId("credential", "request-1", "hash", 0);
    const second = await createStableEventId("credential", "request-1", "hash", 0);
    expect(first).toBe(second);
    expect(first).not.toBe(await createStableEventId("credential", "request-1", "other-hash", 0));
  });

  it("bounds idempotency keys to safe header characters", () => {
    expect(isValidIdempotencyKey("sdk:batch-123")).toBe(true);
    expect(isValidIdempotencyKey("x".repeat(129))).toBe(false);
    expect(isValidIdempotencyKey("bad key")).toBe(false);
  });
});
