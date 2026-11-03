import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn() }));

vi.mock("./database", () => ({
  withDatabase: async (_env: unknown, callback: (database: unknown) => Promise<unknown>) => callback({ select: mocks.select, update: mocks.update }),
}));

import { scheduleDueUptimeMonitors } from "./uptime-scheduler";

describe("uptime scheduler configuration", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => { mocks.select.mockReset(); mocks.update.mockReset(); });

  it("stores the active check ID in the claim and sends the same ID to the queue", async () => {
    const monitor = {
      id: "monitor-a", organizationId: "org-a", projectId: "project-a",
      url: "https://status.example.com", method: "GET", timeoutMs: 10000, expectedStatusCode: 200,
      nextCheckAt: new Date("2026-11-03T12:01:00.000Z"),
    };
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ id: monitor.id }] }) }) }) });
    const set = vi.fn().mockReturnValue({ where: () => ({ returning: async () => [monitor] }) });
    mocks.update.mockReturnValue({ set });
    const send = vi.fn().mockResolvedValue(undefined);
    await expect(scheduleDueUptimeMonitors({ UPTIME_PROBES: { send } } as never)).resolves.toBe(1);
    const claimedCheckId = set.mock.calls[0]?.[0].activeCheckId;
    expect(claimedCheckId).toEqual(expect.any(String));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ checkId: claimedCheckId }));
  });
  it("rolls back the schedule and active token when queue enqueue fails", async () => {
    const previousNextCheckAt = new Date("2026-11-03T12:00:00.000Z");
    const claimedMonitor = {
      id: "monitor-a", organizationId: "org-a", projectId: "project-a",
      url: "https://status.example.com", method: "GET", timeoutMs: 10000, expectedStatusCode: 200,
      nextCheckAt: new Date("2026-11-03T12:01:00.000Z"),
    };
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => [{ id: claimedMonitor.id }] }),
        }),
      }),
    });
    const firstWhere = vi.fn().mockReturnValue({ returning: async () => [claimedMonitor] });
    const rollbackWhere = vi.fn().mockResolvedValue([]);
    const set = vi.fn()
      .mockReturnValueOnce({ where: firstWhere })
      .mockReturnValueOnce({ where: rollbackWhere });
    mocks.update.mockReturnValue({ set });
    const send = vi.fn().mockRejectedValue(new Error("queue unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(scheduleDueUptimeMonitors({ UPTIME_PROBES: { send } } as never)).resolves.toBe(0);

    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenNthCalledWith(2, expect.objectContaining({
      nextCheckAt: expect.any(Date),
      activeCheckId: null,
    }));
    expect(rollbackWhere).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("Jerico failed to enqueue uptime probe", expect.objectContaining({
      monitorId: claimedMonitor.id,
    }));
  });

  it("does not query or claim monitors when the probe queue is missing", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(scheduleDueUptimeMonitors({})).resolves.toBe(0);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("UPTIME_PROBES"));
  });
});
