CREATE TABLE "ingest_rate_limits" (
  "credential_id" text PRIMARY KEY NOT NULL REFERENCES "project_ingestion_keys"("id") ON DELETE CASCADE,
  "window_started_at" timestamptz NOT NULL,
  "request_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ingest_rate_limits_request_count_check" CHECK ("request_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "ingest_rate_limits_window_idx" ON "ingest_rate_limits" ("window_started_at");
