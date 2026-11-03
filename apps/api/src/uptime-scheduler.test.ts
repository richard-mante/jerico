import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleDueUptimeMonitors } from "./uptime-scheduler";

describe("uptime scheduler configuration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not query or claim monitors when the probe queue is missing", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(scheduleDueUptimeMonitors({})).resolves.toBe(0);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("UPTIME_PROBES"));
  });
});
