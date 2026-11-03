ALTER TABLE "notification_deliveries" ADD COLUMN "enqueue_attempts" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "next_enqueue_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_enqueue_attempts_check" CHECK ("enqueue_attempts" BETWEEN 0 AND 5);
--> statement-breakpoint
CREATE INDEX "notification_deliveries_enqueue_retry_idx" ON "notification_deliveries" ("status", "last_error_code", "next_enqueue_at");
