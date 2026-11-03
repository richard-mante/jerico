ALTER TABLE "notification_deliveries" ADD COLUMN "enqueued_at" timestamptz;
--> statement-breakpoint
-- Existing queued rows predate enqueue leases. Treat them as already handed
-- to the queue; only rows created under the lease protocol are crash-recovered.
UPDATE "notification_deliveries"
SET "enqueued_at" = "created_at"
WHERE "status" = 'queued' AND "enqueued_at" IS NULL AND "next_enqueue_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "notification_deliveries_outbox_lease_idx"
  ON "notification_deliveries" ("status", "enqueued_at", "next_enqueue_at");
