CREATE TABLE "project_error_group_states" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "project_id" text NOT NULL,
  "fingerprint" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "updated_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "project_error_group_states_pk" PRIMARY KEY ("project_id", "fingerprint"),
  CONSTRAINT "project_error_group_states_status_check" CHECK ("status" IN ('open', 'resolved', 'ignored')),
  CONSTRAINT "project_error_group_states_project_same_organization_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "project_error_group_states_org_project_idx" ON "project_error_group_states" ("organization_id", "project_id");
