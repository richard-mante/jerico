import { and, asc, eq, lt, lte, sql } from "drizzle-orm";
import { uptimeCheckResults, uptimeMonitors } from "@jerico/database/schema";
import { withDatabase, type ApiBindings } from "./database";

type UptimeProbeMessage = {
  schemaVersion: 1;
  type: "uptime.probe";
  checkId: string;
  monitorId: string;
  organizationId: string;
  projectId: string;
  url: string;
  method: "GET" | "HEAD";
  timeoutMs: number;
  expectedStatusCode: number;
};

export async function scheduleDueUptimeMonitors(env: ApiBindings): Promise<number> {
  if (!env.UPTIME_PROBES) {
    console.warn("Jerico uptime scheduler is not configured: UPTIME_PROBES queue binding is missing.");
    return 0;
  }
  return withDatabase(env, async (database) => {
    const discoveredAt = new Date();
    // Discover IDs only. Monitor configuration is read from the row returned
    // by the atomic claim, not this potentially stale scheduling snapshot.
    const due = await database.select({ id: uptimeMonitors.id }).from(uptimeMonitors)
      .where(and(eq(uptimeMonitors.enabled, true), lte(uptimeMonitors.nextCheckAt, discoveredAt)))
      .orderBy(asc(uptimeMonitors.nextCheckAt))
      .limit(50);
    let enqueued = 0;

    for (const candidate of due) {
      const claimedAt = new Date();
      const checkId = crypto.randomUUID();
      const [monitor] = await database.update(uptimeMonitors)
        .set({
          // Calculate from the current database row's interval while holding
          // the update lock, so concurrent edits cannot leave a stale cadence.
          nextCheckAt: sql`${claimedAt}::timestamptz + (${uptimeMonitors.intervalSeconds} * interval '1 second')`,
          activeCheckId: checkId,
          updatedAt: claimedAt,
        })
        .where(and(
          eq(uptimeMonitors.id, candidate.id),
          eq(uptimeMonitors.enabled, true),
          lte(uptimeMonitors.nextCheckAt, claimedAt),
        ))
        .returning();
      if (!monitor) continue;

      const message: UptimeProbeMessage = {
        schemaVersion: 1,
        type: "uptime.probe",
        checkId,
        monitorId: monitor.id,
        organizationId: monitor.organizationId,
        projectId: monitor.projectId,
        url: monitor.url,
        method: monitor.method as "GET" | "HEAD",
        timeoutMs: monitor.timeoutMs,
        expectedStatusCode: monitor.expectedStatusCode,
      };
      try {
        await env.UPTIME_PROBES.send(message);
        enqueued += 1;
      } catch (error) {
        // Only roll back the schedule if it is still the exact claim made by
        // this invocation. A concurrent edit or newer schedule must win.
        await database.update(uptimeMonitors)
          .set({ nextCheckAt: claimedAt, activeCheckId: null, updatedAt: new Date() })
          .where(and(
            eq(uptimeMonitors.id, monitor.id),
            eq(uptimeMonitors.enabled, true),
            eq(uptimeMonitors.nextCheckAt, monitor.nextCheckAt),
            eq(uptimeMonitors.activeCheckId, checkId),
          ));
        console.error("Jerico failed to enqueue uptime probe", {
          monitorId: monitor.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return enqueued;
  });
}

export async function pruneUptimeCheckHistory(env: ApiBindings, now = new Date()): Promise<void> {
  await withDatabase(env, async (database) => {
    const retentionCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    await database.delete(uptimeCheckResults).where(lt(uptimeCheckResults.checkedAt, retentionCutoff));
  });
}
