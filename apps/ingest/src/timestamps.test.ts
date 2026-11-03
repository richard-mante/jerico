import { describe, expect, it } from "vitest";
import { hasFutureTimestampBeyondSkew } from "./timestamps";

describe("ingestion event timestamp bounds", () => {
  const acceptedAt = new Date("2026-11-03T14:00:00.000Z");

  it("accepts timestamps at the 60-second future-skew boundary", () => {
    expect(hasFutureTimestampBeyondSkew([
      { timestamp: "2026-11-03T14:01:00.000Z" },
    ], acceptedAt)).toBe(false);
  });

  it("rejects timestamps beyond the future-skew boundary", () => {
    expect(hasFutureTimestampBeyondSkew([
      { timestamp: "2026-11-03T14:01:00.001Z" },
    ], acceptedAt)).toBe(true);
  });

  it("continues to accept historical timestamps for offline/backfilled events", () => {
    expect(hasFutureTimestampBeyondSkew([
      { timestamp: "2020-01-01T00:00:00.000Z" },
    ], acceptedAt)).toBe(false);
  });

  it("accepts events without a client timestamp", () => {
    expect(hasFutureTimestampBeyondSkew([{}], acceptedAt)).toBe(false);
  });

  it("supports offset-aware timestamps", () => {
    expect(hasFutureTimestampBeyondSkew([
      { timestamp: "2026-11-03T15:01:01.000+01:00" },
    ], acceptedAt)).toBe(true);
  });
});
