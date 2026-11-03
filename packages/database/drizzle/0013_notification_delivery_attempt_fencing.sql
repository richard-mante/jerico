ALTER TABLE "notification_deliveries"
  ADD COLUMN "active_attempt_id" text,
  ADD COLUMN "active_enqueue_attempt" integer NOT NULL DEFAULT 0,
  ADD COLUMN "active_queue_attempt" integer NOT NULL DEFAULT 0;

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_active_attempts_check"
  CHECK ("active_enqueue_attempt" >= 0 AND "active_queue_attempt" >= 0);
