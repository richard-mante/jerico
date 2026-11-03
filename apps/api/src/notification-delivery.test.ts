import { describe, expect, it } from "vitest";
import { notificationEnqueueRetryDelay } from "./notification-delivery";

describe("notification enqueue retry backoff", () => {
  it("uses exponential delays beginning at one minute", () => {
    expect(notificationEnqueueRetryDelay(1)).toBe(60_000);
    expect(notificationEnqueueRetryDelay(2)).toBe(120_000);
    expect(notificationEnqueueRetryDelay(3)).toBe(240_000);
    expect(notificationEnqueueRetryDelay(4)).toBe(480_000);
  });

  it("caps the delay at one hour", () => {
    expect(notificationEnqueueRetryDelay(5)).toBe(960_000);
    expect(notificationEnqueueRetryDelay(20)).toBe(60 * 60_000);
  });
});
