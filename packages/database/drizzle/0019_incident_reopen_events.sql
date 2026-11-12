ALTER TABLE "notification_channels" ADD COLUMN "notify_on_reopened" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "event_key" text;
--> statement-breakpoint
UPDATE "notification_deliveries" SET "event_key" = "id" WHERE "event_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "event_key" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "notification_deliveries_incident_channel_event_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_incident_channel_event_key_unique" ON "notification_deliveries" USING btree ("incident_id", "channel_id", "event_key");
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_event_type_check";
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_event_type_check" CHECK ("event_type" IN ('incident.opened', 'incident.acknowledged', 'incident.resolved', 'incident.reopened'));
--> statement-breakpoint
ALTER TABLE "incident_activity" DROP CONSTRAINT "incident_activity_type_check";
--> statement-breakpoint
ALTER TABLE "incident_activity" ADD CONSTRAINT "incident_activity_type_check" CHECK ("activity_type" IN ('opened', 'acknowledged', 'resolved', 'reopened', 'assigned', 'note'));
