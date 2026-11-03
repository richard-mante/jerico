import { and, eq, isNotNull } from "drizzle-orm";
import { notificationChannels, notificationDeliveries } from "@jerico/database/schema";
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
    const [delivery] = await database.insert(notificationDeliveries).values({
      id: crypto.randomUUID(),
      organizationId: incident.organizationId,
      projectId: incident.projectId,
      incidentId: incident.id,
      channelId: channel.id,
      target: channel.target,
      eventType,
      status: "queued",
    }).onConflictDoNothing().returning({ id: notificationDeliveries.id });
    if (!delivery) continue;

    if (channel.type === "webhook") {
      if (!channel.secretCiphertext || !channel.secretIv) {
        await database.update(notificationDeliveries).set({
          status: "failed",
          lastErrorCode: "configuration_missing",
          updatedAt: new Date(),
        }).where(eq(notificationDeliveries.id, delivery.id));
        continue;
      }
      const message = {
        schemaVersion: 1 as const,
        type: "notification.webhook" as const,
        deliveryId: delivery.id,
        url: channel.target,
        secretCiphertext: channel.secretCiphertext,
        secretIv: channel.secretIv,
        eventType,
        incidentId: incident.id,
        projectId: incident.projectId,
        title: incident.title.slice(0, 200),
        triggerValue: incident.triggerValue,
        occurredAt: new Date().toISOString(),
      };
      if (!env.NOTIFICATIONS) {
        await database.update(notificationDeliveries).set({
          status: "failed",
          lastErrorCode: "queue_unavailable",
          updatedAt: new Date(),
        }).where(eq(notificationDeliveries.id, delivery.id));
        continue;
      }
      try {
        await env.NOTIFICATIONS.send(message);
      } catch (error) {
        await database.update(notificationDeliveries).set({
          status: "failed",
          lastErrorCode: "queue_unavailable",
          updatedAt: new Date(),
        }).where(eq(notificationDeliveries.id, delivery.id));
        console.error("Jerico could not enqueue webhook notification", {
          deliveryId: delivery.id,
          incidentId: incident.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    if (!env.NOTIFICATIONS) {
      await database.update(notificationDeliveries).set({
        status: "failed",
        lastErrorCode: "queue_unavailable",
        updatedAt: new Date(),
      }).where(eq(notificationDeliveries.id, delivery.id));
      continue;
    }

    const eventLabel = eventType === "incident.opened" ? "Incident opened" : eventType === "incident.acknowledged" ? "Incident acknowledged" : "Incident resolved";
    const dashboardUrl = (env.WEB_APP_URL ?? "http://localhost:3000") + "/dashboard/projects/" + encodeURIComponent(incident.projectId) + "/alerts";
    const message: EmailNotificationMessage = {
      schemaVersion: 1,
      type: "notification.email",
      deliveryId: delivery.id,
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
    try {
      await env.NOTIFICATIONS.send(message);
    } catch (error) {
      await database.update(notificationDeliveries).set({
        status: "failed",
        lastErrorCode: "queue_unavailable",
        updatedAt: new Date(),
      }).where(eq(notificationDeliveries.id, delivery.id));
      console.error("Jerico could not enqueue incident notification", {
        deliveryId: delivery.id,
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
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
