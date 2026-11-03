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
  it("does not query or claim monitors when the probe queue is missing", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(scheduleDueUptimeMonitors({})).resolves.toBe(0);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("UPTIME_PROBES"));
  });
});
