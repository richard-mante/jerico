import { and, eq, gte, lte, or } from "drizzle-orm";
import { alertRules, incidents, uptimeCheckResults } from "@jerico/database/schema";
import { withDatabase, type ApiBindings } from "./database";
import { queryTelemetryErrorCount, type TelemetryQueryBindings } from "./telemetry-query";

type AlertEnvironment = ApiBindings & TelemetryQueryBindings;

function percentile95(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function isBreaching(value: number, comparison: string, threshold: number) {
  return comparison === "gt" ? value > threshold : value >= threshold;
}

export async function evaluateAlertRules(env: AlertEnvironment, now = new Date()): Promise<{ evaluated: number; opened: number; resolved: number }> {
  return withDatabase(env, async (database) => {
    const rules = await database.select().from(alertRules).where(eq(alertRules.enabled, true));
    let opened = 0;
    let resolved = 0;

    for (const rule of rules) {
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
          const checks = await database.select({
            status: uptimeCheckResults.status,
            responseTimeMs: uptimeCheckResults.responseTimeMs,
          }).from(uptimeCheckResults).where(and(
            eq(uptimeCheckResults.organizationId, rule.organizationId),
            eq(uptimeCheckResults.projectId, rule.projectId),
            gte(uptimeCheckResults.checkedAt, from),
            lte(uptimeCheckResults.checkedAt, now),
          ));
          if (rule.metric === "uptime_down") value = checks.length ? checks.filter((check) => check.status === "down").length : null;
          else value = percentile95(checks.flatMap((check) => check.responseTimeMs === null ? [] : [check.responseTimeMs]));
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

      if (value === null || !Number.isFinite(value)) continue;
      const breached = isBreaching(value, rule.comparison, rule.threshold);
      const nextCount = breached ? rule.consecutiveCount + 1 : 0;
      await database.update(alertRules).set({
        consecutiveCount: nextCount,
        lastEvaluatedAt: now,
        updatedAt: now,
      }).where(eq(alertRules.id, rule.id));

      const active = await database.select({ id: incidents.id, status: incidents.status })
        .from(incidents)
        .where(and(
          eq(incidents.alertRuleId, rule.id),
          or(eq(incidents.status, "open"), eq(incidents.status, "acknowledged")),
        )).limit(1);

      if (breached && nextCount >= rule.consecutiveBreaches) {
        if (active[0]) {
          await database.update(incidents).set({
            triggerValue: Math.round(value),
            lastTriggeredAt: now,
            updatedAt: now,
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
          if (created) opened += 1;
        }
      } else if (!breached && active[0]) {
        await database.update(incidents).set({
          status: "resolved",
          resolvedAt: now,
          updatedAt: now,
        }).where(eq(incidents.id, active[0].id));
        resolved += 1;
      }
    }
    return { evaluated: rules.length, opened, resolved };
  });
}
