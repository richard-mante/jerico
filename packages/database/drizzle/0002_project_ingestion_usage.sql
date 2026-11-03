CREATE TABLE "project_ingestion_usage" (
  "credential_id" text NOT NULL REFERENCES "project_ingestion_keys"("id") ON DELETE CASCADE,
  "usage_date" date NOT NULL,
  "event_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "project_ingestion_usage_pk" PRIMARY KEY ("credential_id", "usage_date"),
  CONSTRAINT "project_ingestion_usage_event_count_check" CHECK ("event_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "project_ingestion_usage_date_idx" ON "project_ingestion_usage" ("usage_date");
