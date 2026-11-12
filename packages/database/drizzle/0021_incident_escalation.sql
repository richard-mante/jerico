ALTER TABLE "alert_rules" ADD COLUMN "escalation_delay_minutes" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_escalation_delay_check" CHECK ("escalation_delay_minutes" IN (0, 5, 15, 30, 60));
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "escalated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "escalation_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "notify_on_escalated" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "incident_activity" DROP CONSTRAINT "incident_activity_type_check";
--> statement-breakpoint
ALTER TABLE "incident_activity" ADD CONSTRAINT "incident_activity_type_check" CHECK ("activity_type" IN ('opened', 'acknowledged', 'resolved', 'reopened', 'escalated', 'assigned', 'note'));
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_event_type_check";
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_event_type_check" CHECK ("event_type" IN ('incident.opened', 'incident.acknowledged', 'incident.resolved', 'incident.reopened', 'incident.escalated'));
