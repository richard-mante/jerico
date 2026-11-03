import { describe, expect, it } from "vitest";
import { dailyEventLimit, secondsUntilUtcMidnight, utcUsageDate } from "./quota";

describe("daily ingestion quota helpers", () => {
  it("uses a UTC date key", () => {
    expect(utcUsageDate(new Date("2026-11-03T23:59:59.000Z"))).toBe("2026-11-03");
    expect(utcUsageDate(new Date("2026-11-04T00:00:00.000Z"))).toBe("2026-11-04");
  });

  it("calculates retry time until the next UTC midnight", () => {
    expect(secondsUntilUtcMidnight(new Date("2026-11-03T23:59:00.000Z"))).toBe(60);
  });

  it("defaults and validates the configured daily event limit", () => {
    expect(dailyEventLimit()).toBe(100000);
    expect(dailyEventLimit("5000")).toBe(5000);
    expect(() => dailyEventLimit("0")).toThrow();
    expect(() => dailyEventLimit("not-a-number")).toThrow();
  });
});
