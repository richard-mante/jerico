import { and, asc, eq, lt, lte } from "drizzle-orm";
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
    const now = new Date();
    const due = await database.select().from(uptimeMonitors)
      .where(and(eq(uptimeMonitors.enabled, true), lte(uptimeMonitors.nextCheckAt, now)))
      .orderBy(asc(uptimeMonitors.nextCheckAt))
      .limit(50);
    let enqueued = 0;

    for (const monitor of due) {
      const nextCheckAt = new Date(now.getTime() + monitor.intervalSeconds * 1000);
      const [claimed] = await database.update(uptimeMonitors)
        .set({ nextCheckAt, updatedAt: now })
        .where(and(
          eq(uptimeMonitors.id, monitor.id),
          eq(uptimeMonitors.enabled, true),
          lte(uptimeMonitors.nextCheckAt, now),
        ))
        .returning({ id: uptimeMonitors.id });
      if (!claimed) continue;

      const message: UptimeProbeMessage = {
        schemaVersion: 1,
        type: "uptime.probe",
        checkId: crypto.randomUUID(),
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
        await database.update(uptimeMonitors)
          .set({ nextCheckAt: now, updatedAt: now })
          .where(and(eq(uptimeMonitors.id, monitor.id), eq(uptimeMonitors.enabled, true)));
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
