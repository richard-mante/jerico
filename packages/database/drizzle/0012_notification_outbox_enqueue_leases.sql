ALTER TABLE "notification_deliveries"
  ADD COLUMN "enqueue_lease_expires_at" timestamptz;

-- Existing queued rows predate leases. Give them a short recovery window so
-- the scheduler can reclaim any outbox entries abandoned before this migration.
UPDATE "notification_deliveries"
SET "enqueue_lease_expires_at" = now()
WHERE "status" = 'queued';

CREATE INDEX "notification_deliveries_enqueue_lease_idx"
  ON "notification_deliveries" ("status", "enqueue_lease_expires_at");
