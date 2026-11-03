import { and, asc, eq, gte, isNotNull, isNull, lte, lt, or, sql } from "drizzle-orm";
import { incidents, notificationChannels, notificationDeliveries } from "@jerico/database/schema";
import type { ApiBindings, JericoDatabase } from "./database";

export type IncidentNotificationEvent = "incident.opened" | "incident.acknowledged" | "incident.resolved";
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
export const NOTIFICATION_ENQUEUE_LEASE_MS = 2 * 60_000;

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
    : delivery.eventType === "incident.acknowledged" ? "Incident acknowledged" : "Incident resolved";
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
): Promise<void> {
  const channels = await database.select().from(notificationChannels).where(and(
    eq(notificationChannels.organizationId, incident.organizationId),
    eq(notificationChannels.enabled, true),
    isNotNull(notificationChannels.verifiedAt),
  ));

  for (const channel of channels) {
    const enqueueStartedAt = new Date();
    const enqueueLeaseExpiresAt = notificationEnqueueLeaseExpiresAt(enqueueStartedAt);
    const enqueueToken = crypto.randomUUID();
    const [delivery] = await database.insert(notificationDeliveries).values({
      id: crypto.randomUUID(),
      organizationId: incident.organizationId,
      projectId: incident.projectId,
      incidentId: incident.id,
      channelId: channel.id,
      target: channel.target,
      eventType,
      status: "queued",
      enqueueAttempts: 1,
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
    if (!delivery) continue;

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
      enqueueToken: notificationDeliveries.activeEnqueueToken,
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
): Promise<void> {
  try {
    await queueIncidentNotifications(database, env, incident, eventType);
  } catch (error) {
    console.error("Jerico incident notification enqueue failed", {
      incidentId: incident.id,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
