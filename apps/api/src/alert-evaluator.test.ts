import { describe, expect, it } from "vitest";
import {
  ALERT_EVALUATION_LEASE_MS,
  isAlertEvaluationLeaseAvailable,
  isBreaching,
  nextConsecutiveCount,
  percentile95,
} from "./alert-evaluator";

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

  it("keeps an active lease exclusive and permits reclaim at expiry", () => {
    const now = new Date("2026-11-03T13:00:00.000Z");
    const expiresAt = new Date(now.getTime() + ALERT_EVALUATION_LEASE_MS);
    expect(isAlertEvaluationLeaseAvailable(expiresAt, now)).toBe(false);
    expect(isAlertEvaluationLeaseAvailable(expiresAt, expiresAt)).toBe(true);
    expect(isAlertEvaluationLeaseAvailable(null, now)).toBe(true);
  });

  it("increments the claimed consecutive count and resets after a non-breach", () => {
    expect(nextConsecutiveCount(0, true)).toBe(1);
    expect(nextConsecutiveCount(2, true)).toBe(3);
    expect(nextConsecutiveCount(3, false)).toBe(0);
  });
});
