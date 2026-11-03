ALTER TABLE "notification_deliveries" ADD COLUMN "active_enqueue_token" text;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "active_consumer_attempt" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_active_consumer_attempt_check" CHECK ("active_consumer_attempt" BETWEEN 0 AND 100);
