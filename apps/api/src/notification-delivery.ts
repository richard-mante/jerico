import { and, asc, eq, gte, isNotNull, isNull, lte, lt, or, sql } from "drizzle-orm";
import { incidents, notificationChannels, notificationDeliveries } from "@jerico/database/schema";
import type { ApiBindings, JericoDatabase } from "./database";

export type IncidentNotificationEvent = "incident.opened" | "incident.acknowledged" | "incident.resolved" | "incident.reopened";
export type EmailNotificationMessage = {
  schemaVersion: 1;
  type: "notification.email";
  deliveryId: string;
  to: string;
  subject: string;
  text: string;
};

const MAX_ENQUEUE_ATTEMPTS = 5;
const ENQUEUE_RETRY_BASE_MS = 60_000;
const ENQUEUE_RETRY_MAX_MS = 60 * 60_000;
type QuietHoursChannel = { quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string; timezone: string };
function getLocalTimeParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}
function localDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const target = Date.UTC(year, month - 1, day, hour, minute); let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) { const local = getLocalTimeParts(new Date(guess), timezone); const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute); guess += target - represented; }
  return new Date(guess);
}
export function nextNotificationDeliveryAt(channel: QuietHoursChannel, now = new Date()): Date {
  if (!channel.quietHoursEnabled) return now;
  const [startHour, startMinute] = channel.quietHoursStart.split(":").map(Number); const [endHour, endMinute] = channel.quietHoursEnd.split(":").map(Number);
  const start = startHour * 60 + startMinute; const end = endHour * 60 + endMinute;
  const local = getLocalTimeParts(now, channel.timezone); const current = local.hour * 60 + local.minute;
  const quiet = start < end ? current >= start && current < end : current >= start || current < end;
  if (!quiet) return now;
  const nextDay = start > end && current >= start; const targetDay = new Date(Date.UTC(local.year, local.month - 1, local.day + (nextDay ? 1 : 0)));
  const scheduled = localDateTimeToUtc(targetDay.getUTCFullYear(), targetDay.getUTCMonth() + 1, targetDay.getUTCDate(), endHour, endMinute, channel.timezone);
  return scheduled.getTime() > now.getTime() ? scheduled : new Date(scheduled.getTime() + 24 * 60 * 60 * 1000);
}

export const NOTIFICATION_ENQUEUE_LEASE_MS = 2 * 60_000;

function isEventEnabled(channel: { notifyOnOpened: boolean; notifyOnAcknowledged: boolean; notifyOnResolved: boolean; notifyOnReopened: boolean }, eventType: IncidentNotificationEvent): boolean {
  if (eventType === "incident.opened") return channel.notifyOnOpened;
  if (eventType === "incident.acknowledged") return channel.notifyOnAcknowledged;
  if (eventType === "incident.reopened") return channel.notifyOnReopened;
  return channel.notifyOnResolved;
}

export function notificationEnqueueLeaseExpiresAt(now: Date): Date {
  return new Date(now.getTime() + NOTIFICATION_ENQUEUE_LEASE_MS);
}

export function notificationEnqueueRetryDelay(attempt: number): number {
  return Math.min(ENQUEUE_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), ENQUEUE_RETRY_MAX_MS);
}

function buildNotificationMessage(
  delivery: { id: string; enqueueToken: string; eventType: string; createdAt: Date },
  channel: { type: string; target: string; secretCiphertext: string | null; secretIv: string | null },
  incident: { id: string; projectId: string; title: string; triggerValue: number },
  env: ApiBindings,
) {
  if (channel.type === "webhook") {
    if (!channel.secretCiphertext || !channel.secretIv) return null;
    return {
      schemaVersion: 1 as const,
      type: "notification.webhook" as const,
      deliveryId: delivery.id,
      enqueueToken: delivery.enqueueToken,
      url: channel.target,
      secretCiphertext: channel.secretCiphertext,
      secretIv: channel.secretIv,
      eventType: delivery.eventType as IncidentNotificationEvent,
      incidentId: incident.id,
      projectId: incident.projectId,
      title: incident.title.slice(0, 200),
      triggerValue: incident.triggerValue,
      occurredAt: delivery.createdAt.toISOString(),
    };
  }

  const eventLabel = delivery.eventType === "incident.opened"
    ? "Incident opened"
    : delivery.eventType === "incident.acknowledged" ? "Incident acknowledged" : delivery.eventType === "incident.reopened" ? "Incident reopened" : "Incident resolved";
  const dashboardUrl = (env.WEB_APP_URL ?? "http://localhost:3000")
    + "/dashboard/projects/" + encodeURIComponent(incident.projectId) + "/alerts";
  return {
    schemaVersion: 1 as const,
    type: "notification.email" as const,
    deliveryId: delivery.id,
    enqueueToken: delivery.enqueueToken,
    to: channel.target,
    subject: `[${eventLabel}] ${incident.title}`,
    text: [
      eventLabel + ": " + incident.title,
      "Project: " + incident.projectId,
      "Latest trigger value: " + incident.triggerValue,
      "Incident: " + incident.id,
      "Open the project alerts dashboard: " + dashboardUrl,
    ].join("\n"),
  };
}

async function markEnqueueFailure(
  database: JericoDatabase,
  delivery: { id: string; enqueueAttempts: number; attempts: number },
  now: Date,
): Promise<void> {
  const exhausted = delivery.enqueueAttempts >= MAX_ENQUEUE_ATTEMPTS;
  await database.update(notificationDeliveries).set({
    status: "failed",
    lastErrorCode: exhausted ? "queue_retry_exhausted" : "queue_unavailable",
    nextEnqueueAt: exhausted ? null : new Date(now.getTime() + notificationEnqueueRetryDelay(delivery.enqueueAttempts)),
    updatedAt: now,
  }).where(and(
    eq(notificationDeliveries.id, delivery.id),
    eq(notificationDeliveries.status, "queued"),
    eq(notificationDeliveries.enqueueAttempts, delivery.enqueueAttempts),
    eq(notificationDeliveries.attempts, delivery.attempts),
  ));
}

export async function queueIncidentNotifications(
  database: JericoDatabase,
  env: ApiBindings,
  incident: { id: string; organizationId: string; projectId: string; title: string; triggerValue: number },
  eventType: IncidentNotificationEvent,
  eventKey: string = crypto.randomUUID(),
): Promise<void> {
  const channels = await database.select().from(notificationChannels).where(and(
    eq(notificationChannels.organizationId, incident.organizationId),
    eq(notificationChannels.enabled, true),
    isNotNull(notificationChannels.verifiedAt),
  ));
  const eligibleChannels = channels.filter((channel) => isEventEnabled(channel, eventType));

  for (const channel of eligibleChannels) {
    const enqueueStartedAt = new Date();
    const scheduledAt = nextNotificationDeliveryAt(channel, enqueueStartedAt);
    const deferredByQuietHours = scheduledAt.getTime() > enqueueStartedAt.getTime();
    const enqueueLeaseExpiresAt = deferredByQuietHours ? scheduledAt : notificationEnqueueLeaseExpiresAt(enqueueStartedAt);
    const enqueueToken = deferredByQuietHours ? null : crypto.randomUUID();
    const [delivery] = await database.insert(notificationDeliveries).values({
      id: crypto.randomUUID(),
      organizationId: incident.organizationId,
      projectId: incident.projectId,
      incidentId: incident.id,
      channelId: channel.id,
      target: channel.target,
      eventType,
      eventKey,
      status: "queued",
      enqueueAttempts: deferredByQuietHours ? 0 : 1,
      nextEnqueueAt: enqueueLeaseExpiresAt,
      activeEnqueueToken: enqueueToken,
      activeConsumerAttempt: 0,
    }).onConflictDoNothing().returning({
      id: notificationDeliveries.id,
      enqueueAttempts: notificationDeliveries.enqueueAttempts,
      attempts: notificationDeliveries.attempts,
      eventType: notificationDeliveries.eventType,
      createdAt: notificationDeliveries.createdAt,
    });
    if (!delivery || deferredByQuietHours) continue;

    const message = buildNotificationMessage({ ...delivery, enqueueToken }, channel, incident, env);
    if (!message) {
      await database.update(notificationDeliveries).set({
        status: "failed",
        lastErrorCode: "configuration_missing",
        nextEnqueueAt: null,
        updatedAt: new Date(),
      }).where(and(eq(notificationDeliveries.id, delivery.id), eq(notificationDeliveries.status, "queued")));
      continue;
    }

    if (!env.NOTIFICATIONS) {
      await markEnqueueFailure(database, delivery, new Date());
      continue;
    }
    try {
      await env.NOTIFICATIONS.send(message);
      // A successful send completes the outbox lease. If the Worker dies
      // before this write, the lease expires and reconciliation re-enqueues
      // the same stable delivery ID.
      await database.update(notificationDeliveries).set({ nextEnqueueAt: null, enqueuedAt: new Date(), updatedAt: new Date() }).where(and(
        eq(notificationDeliveries.id, delivery.id),
        eq(notificationDeliveries.status, "queued"),
        eq(notificationDeliveries.enqueueAttempts, delivery.enqueueAttempts),
        eq(notificationDeliveries.attempts, delivery.attempts),
        eq(notificationDeliveries.nextEnqueueAt, enqueueLeaseExpiresAt),
      ));
    } catch (error) {
      await markEnqueueFailure(database, delivery, new Date());
      console.error("Jerico could not enqueue incident notification", {
        deliveryId: delivery.id,
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function retryFailedNotificationEnqueues(
  database: JericoDatabase,
  env: ApiBindings,
  now = new Date(),
): Promise<number> {
  if (!env.NOTIFICATIONS) return 0;

  
  // A queued row with an expired lease may represent a Worker termination
  // between the DB insert and queue send (or after queue acceptance but
  // before the lease-clear write). Preserve the stable delivery ID on retry.
  await database.update(notificationDeliveries).set({
    status: "failed",
    lastErrorCode: "queue_retry_exhausted",
    nextEnqueueAt: null,
    updatedAt: now,
  }).where(and(
    eq(notificationDeliveries.status, "queued"),
    gte(notificationDeliveries.enqueueAttempts, MAX_ENQUEUE_ATTEMPTS),
    isNull(notificationDeliveries.enqueuedAt),
    lte(notificationDeliveries.nextEnqueueAt, now),
  ));

  const due = await database.select().from(notificationDeliveries).where(or(
    and(
      eq(notificationDeliveries.status, "failed"),
      eq(notificationDeliveries.lastErrorCode, "queue_unavailable"),
      lt(notificationDeliveries.enqueueAttempts, MAX_ENQUEUE_ATTEMPTS),
      or(isNull(notificationDeliveries.nextEnqueueAt), lte(notificationDeliveries.nextEnqueueAt, now)),
    ),
    and(
      eq(notificationDeliveries.status, "queued"),
      isNull(notificationDeliveries.enqueuedAt),
      lt(notificationDeliveries.enqueueAttempts, MAX_ENQUEUE_ATTEMPTS),
      lte(notificationDeliveries.nextEnqueueAt, now),
    ),
  )).orderBy(asc(notificationDeliveries.createdAt)).limit(50);

  let enqueued = 0;
  for (const delivery of due) {
    const [channel] = await database.select().from(notificationChannels).where(and(
      eq(notificationChannels.id, delivery.channelId),
      eq(notificationChannels.organizationId, delivery.organizationId),
      eq(notificationChannels.enabled, true),
      isNotNull(notificationChannels.verifiedAt),
    )).limit(1);
    const [incident] = await database.select().from(incidents).where(and(
      eq(incidents.id, delivery.incidentId),
      eq(incidents.organizationId, delivery.organizationId),
      eq(incidents.projectId, delivery.projectId),
    )).limit(1);

    if (channel && incident && !isEventEnabled(channel, delivery.eventType as IncidentNotificationEvent)) {
      await database.update(notificationDeliveries).set({
        status: "failed", lastErrorCode: "channel_preference_disabled", nextEnqueueAt: null, updatedAt: now,
      }).where(and(
        eq(notificationDeliveries.id, delivery.id),
        eq(notificationDeliveries.status, delivery.status),
        eq(notificationDeliveries.enqueueAttempts, delivery.enqueueAttempts),
        eq(notificationDeliveries.attempts, delivery.attempts),
      ));
      continue;
    }

    if (!channel || !incident) {
      await database.update(notificationDeliveries).set({
        status: "failed",
        lastErrorCode: "channel_unavailable",
        nextEnqueueAt: null,
        updatedAt: now,
      }).where(and(
        eq(notificationDeliveries.id, delivery.id),
        eq(notificationDeliveries.status, delivery.status),
        eq(notificationDeliveries.enqueueAttempts, delivery.enqueueAttempts),
        eq(notificationDeliveries.attempts, delivery.attempts),
      ));
      continue;
    }

    const leaseExpiresAt = notificationEnqueueLeaseExpiresAt(now);
    const enqueueToken = crypto.randomUUID();
    const dueCondition = delivery.status === "failed"
      ? and(
        eq(notificationDeliveries.status, "failed"),
        eq(notificationDeliveries.lastErrorCode, "queue_unavailable"),
        or(isNull(notificationDeliveries.nextEnqueueAt), lte(notificationDeliveries.nextEnqueueAt, now)),
      )
      : and(
        eq(notificationDeliveries.status, "queued"),
        isNull(notificationDeliveries.enqueuedAt),
        lte(notificationDeliveries.nextEnqueueAt, now),
      );
    const [claimed] = await database.update(notificationDeliveries).set({
      status: "queued",
      enqueueAttempts: sql`${notificationDeliveries.enqueueAttempts} + 1`,
      nextEnqueueAt: leaseExpiresAt,
      activeEnqueueToken: enqueueToken,
      activeConsumerAttempt: 0,
      updatedAt: now,
    }).where(and(
      eq(notificationDeliveries.id, delivery.id),
      eq(notificationDeliveries.enqueueAttempts, delivery.enqueueAttempts),
      dueCondition,
    )).returning({
      id: notificationDeliveries.id,
      enqueueAttempts: notificationDeliveries.enqueueAttempts,
      attempts: notificationDeliveries.attempts,
      eventType: notificationDeliveries.eventType,
      createdAt: notificationDeliveries.createdAt,
    });
    if (!claimed) continue;

    const message = buildNotificationMessage({ ...claimed, enqueueToken }, channel, incident, env);
    if (!message) {
      await database.update(notificationDeliveries).set({
        status: "failed",
        lastErrorCode: "configuration_missing",
        nextEnqueueAt: null,
        updatedAt: now,
      }).where(and(
        eq(notificationDeliveries.id, delivery.id),
        eq(notificationDeliveries.status, "queued"),
        eq(notificationDeliveries.enqueueAttempts, claimed.enqueueAttempts),
        eq(notificationDeliveries.attempts, claimed.attempts),
      ));
      continue;
    }

    try {
      await env.NOTIFICATIONS.send(message);
      await database.update(notificationDeliveries).set({
        nextEnqueueAt: null,
        enqueuedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(notificationDeliveries.id, claimed.id),
        eq(notificationDeliveries.status, "queued"),
        eq(notificationDeliveries.enqueueAttempts, claimed.enqueueAttempts),
        eq(notificationDeliveries.attempts, claimed.attempts),
        eq(notificationDeliveries.nextEnqueueAt, leaseExpiresAt),
      ));
      enqueued += 1;
    } catch (error) {
      await markEnqueueFailure(database, claimed, now);
      console.error("Jerico could not retry incident notification enqueue", {
        deliveryId: delivery.id,
        incidentId: delivery.incidentId,
        enqueueAttempt: claimed.enqueueAttempts,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return enqueued;
}

export async function safelyQueueIncidentNotifications(
  database: JericoDatabase,
  env: ApiBindings,
  incident: { id: string; organizationId: string; projectId: string; title: string; triggerValue: number },
  eventType: IncidentNotificationEvent,
  eventKey?: string,
): Promise<void> {
  try {
    await queueIncidentNotifications(database, env, incident, eventType, eventKey);
  } catch (error) {
    console.error("Jerico incident notification enqueue failed", {
      incidentId: incident.id,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
export type ManualNotificationRetryResult = "queued" | "scheduled" | "not_found" | "not_retryable" | "channel_unavailable" | "channel_preference_disabled" | "queue_unavailable";

export async function retryNotificationDelivery(
  database: JericoDatabase,
  env: ApiBindings,
  input: { organizationId: string; projectId: string; deliveryId: string },
): Promise<ManualNotificationRetryResult> {
  const [delivery] = await database.select().from(notificationDeliveries).where(and(
    eq(notificationDeliveries.id, input.deliveryId),
    eq(notificationDeliveries.organizationId, input.organizationId),
    eq(notificationDeliveries.projectId, input.projectId),
  )).limit(1);
  if (!delivery) return "not_found";
  if (delivery.status !== "failed") return "not_retryable";

  const [channel] = await database.select().from(notificationChannels).where(and(
    eq(notificationChannels.id, delivery.channelId),
    eq(notificationChannels.organizationId, input.organizationId),
    eq(notificationChannels.enabled, true),
    isNotNull(notificationChannels.verifiedAt),
  )).limit(1);
  if (!channel) return "channel_unavailable";
  if (!isEventEnabled(channel, delivery.eventType as IncidentNotificationEvent)) return "channel_preference_disabled";
  const [incident] = await database.select().from(incidents).where(and(
    eq(incidents.id, delivery.incidentId),
    eq(incidents.organizationId, input.organizationId),
    eq(incidents.projectId, input.projectId),
  )).limit(1);
  if (!incident) return "not_found";
  if (!env.NOTIFICATIONS) return "queue_unavailable";

  const now = new Date();
  const leaseExpiresAt = notificationEnqueueLeaseExpiresAt(now);
  const enqueueToken = crypto.randomUUID();
  const [claimed] = await database.update(notificationDeliveries).set({
    status: "queued",
    enqueueAttempts: 1,
    nextEnqueueAt: leaseExpiresAt,
    enqueuedAt: null,
    activeEnqueueToken: enqueueToken,
    activeConsumerAttempt: 0,
    lastErrorCode: null,
    updatedAt: now,
  }).where(and(
    eq(notificationDeliveries.id, delivery.id),
    eq(notificationDeliveries.organizationId, input.organizationId),
    eq(notificationDeliveries.projectId, input.projectId),
    eq(notificationDeliveries.status, "failed"),
    eq(notificationDeliveries.updatedAt, delivery.updatedAt),
  )).returning({
    id: notificationDeliveries.id,
    enqueueAttempts: notificationDeliveries.enqueueAttempts,
    attempts: notificationDeliveries.attempts,
    eventType: notificationDeliveries.eventType,
    createdAt: notificationDeliveries.createdAt,
  });
  if (!claimed) return "not_retryable";

  const message = buildNotificationMessage({ ...claimed, enqueueToken }, channel, incident, env);
  if (!message) {
    await database.update(notificationDeliveries).set({
      status: "failed", lastErrorCode: "configuration_missing", nextEnqueueAt: null, updatedAt: new Date(),
    }).where(and(eq(notificationDeliveries.id, claimed.id), eq(notificationDeliveries.activeEnqueueToken, enqueueToken)));
    return "channel_unavailable";
  }

  try {
    await env.NOTIFICATIONS.send(message);
    await database.update(notificationDeliveries).set({
      nextEnqueueAt: null, enqueuedAt: new Date(), updatedAt: new Date(),
    }).where(and(
      eq(notificationDeliveries.id, claimed.id),
      eq(notificationDeliveries.status, "queued"),
      eq(notificationDeliveries.activeEnqueueToken, enqueueToken),
      eq(notificationDeliveries.nextEnqueueAt, leaseExpiresAt),
    ));
    return "queued";
  } catch (error) {
    await database.update(notificationDeliveries).set({
      status: "failed",
      lastErrorCode: "queue_unavailable",
      nextEnqueueAt: new Date(Date.now() + notificationEnqueueRetryDelay(1)),
      updatedAt: new Date(),
    }).where(and(
      eq(notificationDeliveries.id, claimed.id),
      eq(notificationDeliveries.status, "queued"),
      eq(notificationDeliveries.activeEnqueueToken, enqueueToken),
    ));
    console.error("Jerico manual notification retry could not enqueue delivery", {
      deliveryId: claimed.id, error: error instanceof Error ? error.message : String(error),
    });
    return "queue_unavailable";
  }
}
