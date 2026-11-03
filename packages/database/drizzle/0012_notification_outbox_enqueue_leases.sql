ALTER TABLE "notification_deliveries"
  ADD COLUMN "enqueue_lease_expires_at" timestamptz;

CREATE INDEX "notification_deliveries_enqueue_lease_idx"
  ON "notification_deliveries" ("status", "enqueue_lease_expires_at");
