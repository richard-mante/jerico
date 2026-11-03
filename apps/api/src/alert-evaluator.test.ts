import { describe, expect, it } from "vitest";
import { isBreaching, percentile95 } from "./alert-evaluator";

describe("alert evaluation helpers", () => {
  it("uses nearest-rank p95 for bounded response-time samples", () => {
    expect(percentile95([])).toBeNull();
    expect(percentile95([10])).toBe(10);
    expect(percentile95([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBe(100);
  });
  it("supports inclusive and exclusive alert comparisons", () => {
    expect(isBreaching(10, "gte", 10)).toBe(true);
    expect(isBreaching(10, "gt", 10)).toBe(false);
    expect(isBreaching(11, "gt", 10)).toBe(true);
  });
});
