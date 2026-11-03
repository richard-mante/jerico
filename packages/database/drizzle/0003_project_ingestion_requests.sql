CREATE TABLE "project_ingestion_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "credential_id" text NOT NULL REFERENCES "project_ingestion_keys"("id") ON DELETE CASCADE,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "envelope" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "project_ingestion_requests_status_check" CHECK ("status" IN ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_ingestion_requests_credential_key_unique" ON "project_ingestion_requests" ("credential_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "project_ingestion_requests_expires_at_idx" ON "project_ingestion_requests" ("expires_at");
