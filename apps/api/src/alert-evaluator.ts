import { and, asc, count, desc, eq, gte, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import { alertRules, incidents, incidentActivity, uptimeCheckResults } from "@jerico/database/schema";
import { withDatabase, type ApiBindings, type JericoDatabase } from "./database";
import { queryTelemetryErrorCount, type TelemetryQueryBindings } from "./telemetry-query";
import { safelyQueueIncidentNotifications } from "./notification-delivery";

type AlertEnvironment = ApiBindings & TelemetryQueryBindings;
export const ALERT_EVALUATION_LEASE_MS = 5 * 60 * 1000;

export function isAlertEvaluationLeaseAvailable(expiresAt: Date | null, now: Date) {
  return expiresAt === null || expiresAt.getTime() <= now.getTime();
}

export function nextConsecutiveCount(current: number, breached: boolean) {
  return breached ? current + 1 : 0;
}

export function percentile95(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

export function isBreaching(value: number, comparison: string, threshold: number) {
  return comparison === "gt" ? value > threshold : value >= threshold;
}

async function escalateUnacknowledgedIncidents(database: JericoDatabase, env: AlertEnvironment, now: Date): Promise<number> {
  const candidates = await database.select({
    id: incidents.id, organizationId: incidents.organizationId, projectId: incidents.projectId,
    title: incidents.title, triggerValue: incidents.triggerValue, startedAt: incidents.startedAt,
    escalationDelayMinutes: alertRules.escalationDelayMinutes,
  }).from(incidents).innerJoin(alertRules, and(
    eq(incidents.alertRuleId, alertRules.id), eq(incidents.organizationId, alertRules.organizationId), eq(incidents.projectId, alertRules.projectId),
  )).where(and(
    eq(incidents.status, "open"), isNull(incidents.escalatedAt), gt(alertRules.escalationDelayMinutes, 0),
    eq(alertRules.enabled, true), or(isNull(alertRules.silencedUntil), lte(alertRules.silencedUntil, now)),
  )).orderBy(asc(incidents.startedAt)).limit(200);
  let escalated = 0;
  for (const incident of candidates) {
    const escalationAt = new Date(incident.startedAt.getTime() + incident.escalationDelayMinutes * 60_000);
    if (escalationAt.getTime() > now.getTime()) continue;
    const [claimed] = await database.update(incidents).set({ escalatedAt: now, escalationCount: sql`${incidents.escalationCount} + 1`, updatedAt: now })
      .where(and(eq(incidents.id, incident.id), eq(incidents.status, "open"), isNull(incidents.escalatedAt))).returning({ id: incidents.id });
    if (!claimed) continue;
    const activityId = crypto.randomUUID();
    await database.insert(incidentActivity).values({ id: activityId, organizationId: incident.organizationId, projectId: incident.projectId, incidentId: incident.id, actorId: null, activityType: "escalated", body: `Incident was not acknowledged within ${incident.escalationDelayMinutes} minutes.` });
    await safelyQueueIncidentNotifications(database, env, incident, "incident.escalated", activityId);
    escalated += 1;
  }
  return escalated;
}
export async function evaluateAlertRules(env: AlertEnvironment, now = new Date()): Promise<{ evaluated: number; opened: number; resolved: number; escalated: number }> {
  return withDatabase(env, async (database) => {
    const escalated = await escalateUnacknowledgedIncidents(database, env, now);
    // Discover IDs only; mutable state comes from the atomic claim result.
    const candidates = await database.select({ id: alertRules.id }).from(alertRules)
      .where(and(eq(alertRules.enabled, true), or(isNull(alertRules.silencedUntil), lte(alertRules.silencedUntil, now))));
    let evaluated = 0;
    let opened = 0;
    let resolved = 0;
    const evaluationMinute = new Date(Math.floor(now.getTime() / 60000) * 60000);

    for (const candidate of candidates) {
      const leaseToken = crypto.randomUUID();
      const leaseClaimedAt = new Date();
      const leaseExpiresAt = new Date(leaseClaimedAt.getTime() + ALERT_EVALUATION_LEASE_MS);
      const [rule] = await database.update(alertRules).set({
        lastEvaluatedAt: now,
        evaluationLeaseToken: leaseToken,
        evaluationLeaseExpiresAt: leaseExpiresAt,
        updatedAt: now,
      }).where(and(
        eq(alertRules.id, candidate.id),
        eq(alertRules.enabled, true),
        or(isNull(alertRules.lastEvaluatedAt), lt(alertRules.lastEvaluatedAt, evaluationMinute)),
        or(isNull(alertRules.evaluationLeaseExpiresAt), lte(alertRules.evaluationLeaseExpiresAt, leaseClaimedAt)),
      )).returning();
      if (!rule) continue;
      evaluated += 1;

      try {
        const from = new Date(now.getTime() - rule.windowSeconds * 1000);
        let value: number | null = null;
        try {
          if (rule.metric === "error_count") {
            value = await queryTelemetryErrorCount(env, {
              organizationId: rule.organizationId,
              projectId: rule.projectId,
              from: from.toISOString(),
              to: now.toISOString(),
            });
          } else {
            const filters = and(
              eq(uptimeCheckResults.organizationId, rule.organizationId),
              eq(uptimeCheckResults.projectId, rule.projectId),
              gte(uptimeCheckResults.checkedAt, from),
              lte(uptimeCheckResults.checkedAt, now),
            );
            if (rule.metric === "uptime_down") {
              const [total] = await database.select({ value: count() }).from(uptimeCheckResults).where(filters);
              const [down] = await database.select({ value: count() }).from(uptimeCheckResults)
                .where(and(filters, eq(uptimeCheckResults.status, "down")));
              value = Number(total?.value ?? 0) > 0 ? Number(down?.value ?? 0) : null;
            } else {
              const checks = await database.select({ responseTimeMs: uptimeCheckResults.responseTimeMs })
                .from(uptimeCheckResults).where(filters)
                .orderBy(desc(uptimeCheckResults.checkedAt)).limit(10000);
              value = percentile95(checks.flatMap((check) => check.responseTimeMs === null ? [] : [check.responseTimeMs]));
            }
          }
        } catch (error) {
          console.error("Jerico alert rule evaluation failed", {
            alertRuleId: rule.id,
            projectId: rule.projectId,
            metric: rule.metric,
            error: error instanceof Error ? error.message : String(error),
          });
          continue;
        }

        // No-data intentionally leaves the consecutive counter unchanged.
        if (value === null || !Number.isFinite(value)) continue;
        const breached = isBreaching(value, rule.comparison, rule.threshold);
        const nextCount = nextConsecutiveCount(rule.consecutiveCount, breached);
        // A reclaimed lease fences the old evaluator from committing stale state.
        const [stateUpdated] = await database.update(alertRules).set({
          consecutiveCount: nextCount,
          updatedAt: now,
        }).where(and(
          eq(alertRules.id, rule.id),
          eq(alertRules.evaluationLeaseToken, leaseToken),
        )).returning({ id: alertRules.id });
        if (!stateUpdated) continue;

        const active = await database.select({ id: incidents.id, status: incidents.status })
          .from(incidents)
          .where(and(
            eq(incidents.alertRuleId, rule.id),
            or(eq(incidents.status, "open"), eq(incidents.status, "acknowledged")),
          )).limit(1);

        if (breached && nextCount >= rule.consecutiveBreaches) {
          if (active[0]) {
            await database.update(incidents).set({
              triggerValue: Math.round(value), lastTriggeredAt: now, updatedAt: now,
            }).where(eq(incidents.id, active[0].id));
          } else {
            const [created] = await database.insert(incidents).values({
              id: crypto.randomUUID(),
              organizationId: rule.organizationId,
              projectId: rule.projectId,
              alertRuleId: rule.id,
              title: rule.name,
              triggerValue: Math.round(value),
              startedAt: now,
              lastTriggeredAt: now,
            }).onConflictDoNothing().returning({ id: incidents.id });
            if (created) {
              opened += 1;
              const activityId = crypto.randomUUID();
              await database.insert(incidentActivity).values({ id: activityId, organizationId: rule.organizationId, projectId: rule.projectId, incidentId: created.id, actorId: null, activityType: "opened", body: "Incident opened by alert evaluation." });
              await safelyQueueIncidentNotifications(database, env, {
                id: created.id, organizationId: rule.organizationId, projectId: rule.projectId,
                title: rule.name, triggerValue: Math.round(value),
              }, "incident.opened", activityId);
            }
          }
        } else if (!breached && active[0]) {
          await database.update(incidents).set({
            status: "resolved", resolvedAt: now, updatedAt: now,
          }).where(eq(incidents.id, active[0].id));
          const activityId = crypto.randomUUID();
          await database.insert(incidentActivity).values({ id: activityId, organizationId: rule.organizationId, projectId: rule.projectId, incidentId: active[0].id, actorId: null, activityType: "resolved", body: "Automatically resolved after the signal returned below threshold." });
          await safelyQueueIncidentNotifications(database, env, {
            id: active[0].id, organizationId: rule.organizationId, projectId: rule.projectId,
            title: rule.name, triggerValue: Math.round(value),
          }, "incident.resolved", activityId);
          resolved += 1;
        }
      } finally {
        // Release on success, no-data, query error, or unexpected failure.
        // The token condition prevents an old worker clearing a newer lease.
        try {
          await database.update(alertRules).set({
            evaluationLeaseToken: null,
            evaluationLeaseExpiresAt: null,
            updatedAt: new Date(),
          }).where(and(
            eq(alertRules.id, rule.id),
            eq(alertRules.evaluationLeaseToken, leaseToken),
          ));
        } catch (error) {
          console.error("Jerico alert evaluation lease release failed", {
            alertRuleId: rule.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return { evaluated, opened, resolved, escalated };
  });
}
