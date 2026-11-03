import { describe, expect, it } from "vitest";
import { NOTIFICATION_ENQUEUE_LEASE_MS, notificationEnqueueLeaseExpiresAt, notificationEnqueueRetryDelay } from "./notification-delivery";

describe("notification enqueue retry backoff", () => {
  it("uses exponential delays beginning at one minute", () => {
    expect(notificationEnqueueRetryDelay(1)).toBe(60_000);
    expect(notificationEnqueueRetryDelay(2)).toBe(120_000);
    expect(notificationEnqueueRetryDelay(3)).toBe(240_000);
    expect(notificationEnqueueRetryDelay(4)).toBe(480_000);
  });

  it("gives each uncompleted queue handoff a bounded two-minute lease", () => {
    const now = new Date("2026-11-03T13:00:00.000Z");
    expect(NOTIFICATION_ENQUEUE_LEASE_MS).toBe(120_000);
    expect(notificationEnqueueLeaseExpiresAt(now)).toEqual(new Date("2026-11-03T13:02:00.000Z"));
  });

  it("caps the delay at one hour", () => {
    expect(notificationEnqueueRetryDelay(5)).toBe(960_000);
    expect(notificationEnqueueRetryDelay(20)).toBe(60 * 60_000);
  });
});


describe("notification enqueue lease recovery", () => {
  it("uses a two-minute lease so abandoned queued rows can be reclaimed", () => {
    expect(notificationEnqueueLeaseDuration()).toBe(120_000);
  });
});
