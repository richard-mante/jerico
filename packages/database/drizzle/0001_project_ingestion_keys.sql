CREATE UNIQUE INDEX "environments_project_id_id_unique" ON "environments" ("project_id", "id");
--> statement-breakpoint
CREATE TABLE "project_ingestion_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "project_id" text NOT NULL,
  "environment_id" text NOT NULL,
  "name" text NOT NULL,
  "key_type" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "created_by" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "last_used_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "project_ingestion_keys_key_type_check" CHECK ("key_type" IN ('public', 'secret')),
  CONSTRAINT "project_ingestion_keys_project_fk"
    FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects" ("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "project_ingestion_keys_environment_fk"
    FOREIGN KEY ("project_id", "environment_id") REFERENCES "environments" ("project_id", "id") ON DELETE CASCADE,
  CONSTRAINT "project_ingestion_keys_hash_unique" UNIQUE ("key_hash")
);
--> statement-breakpoint
CREATE INDEX "project_ingestion_keys_project_idx" ON "project_ingestion_keys" ("organization_id", "project_id");
--> statement-breakpoint
CREATE INDEX "project_ingestion_keys_environment_idx" ON "project_ingestion_keys" ("environment_id");
--> statement-breakpoint
CREATE INDEX "project_ingestion_keys_active_idx" ON "project_ingestion_keys" ("project_id", "revoked_at");
