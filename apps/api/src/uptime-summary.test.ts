import { describe, expect, it } from "vitest";
import { calculateUptimePercentage } from "./uptime-summary";

describe("calculateUptimePercentage", () => {
  it("calculates percentages to two decimal places", () => {
    expect(calculateUptimePercentage(999, 1000)).toBe(99.9);
    expect(calculateUptimePercentage(1, 3)).toBe(33.33);
  });
  it("returns null without checks and clamps invalid counts", () => {
    expect(calculateUptimePercentage(0, 0)).toBeNull();
    expect(calculateUptimePercentage(12, 10)).toBe(100);
    expect(calculateUptimePercentage(-1, 10)).toBe(0);
  });
});
