CREATE TABLE "uptime_monitors" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL,
  "project_id" text NOT NULL,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "method" text NOT NULL DEFAULT 'GET',
  "interval_seconds" integer NOT NULL DEFAULT 60,
  "timeout_ms" integer NOT NULL DEFAULT 10000,
  "expected_status_code" integer NOT NULL DEFAULT 200,
  "enabled" boolean NOT NULL DEFAULT true,
  "next_check_at" timestamptz NOT NULL DEFAULT now(),
  "last_checked_at" timestamptz,
  "last_status" text,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uptime_monitors_method_check" CHECK ("method" IN ('GET', 'HEAD')),
  CONSTRAINT "uptime_monitors_interval_check" CHECK ("interval_seconds" BETWEEN 60 AND 86400),
  CONSTRAINT "uptime_monitors_timeout_check" CHECK ("timeout_ms" BETWEEN 1000 AND 30000),
  CONSTRAINT "uptime_monitors_expected_status_check" CHECK ("expected_status_code" BETWEEN 100 AND 599),
  CONSTRAINT "uptime_monitors_last_status_check" CHECK ("last_status" IS NULL OR "last_status" IN ('up', 'down')),
  CONSTRAINT "uptime_monitors_project_same_organization_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uptime_monitors_id_org_project_unique" ON "uptime_monitors" ("id", "organization_id", "project_id");
--> statement-breakpoint
CREATE INDEX "uptime_monitors_project_idx" ON "uptime_monitors" ("organization_id", "project_id");
--> statement-breakpoint
CREATE INDEX "uptime_monitors_due_idx" ON "uptime_monitors" ("enabled", "next_check_at");
--> statement-breakpoint
CREATE TABLE "uptime_check_results" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL,
  "project_id" text NOT NULL,
  "monitor_id" text NOT NULL,
  "status" text NOT NULL,
  "status_code" integer,
  "response_time_ms" integer,
  "error_code" text,
  "checked_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uptime_check_results_status_check" CHECK ("status" IN ('up', 'down')),
  CONSTRAINT "uptime_check_results_status_code_check" CHECK ("status_code" IS NULL OR "status_code" BETWEEN 100 AND 599),
  CONSTRAINT "uptime_check_results_response_time_check" CHECK ("response_time_ms" IS NULL OR "response_time_ms" >= 0),
  CONSTRAINT "uptime_check_results_monitor_same_project_fk" FOREIGN KEY ("monitor_id", "organization_id", "project_id") REFERENCES "uptime_monitors"("id", "organization_id", "project_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "uptime_check_results_monitor_checked_idx" ON "uptime_check_results" ("monitor_id", "checked_at");
--> statement-breakpoint
CREATE INDEX "uptime_check_results_project_checked_idx" ON "uptime_check_results" ("organization_id", "project_id", "checked_at");

--> statement-breakpoint
CREATE INDEX "uptime_check_results_checked_idx" ON "uptime_check_results" ("checked_at");
