CREATE TABLE "alert_rules" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL,
  "project_id" text NOT NULL,
  "name" text NOT NULL,
  "metric" text NOT NULL,
  "comparison" text NOT NULL DEFAULT 'gte',
  "threshold" integer NOT NULL,
  "window_seconds" integer NOT NULL DEFAULT 300,
  "consecutive_breaches" integer NOT NULL DEFAULT 1,
  "enabled" boolean NOT NULL DEFAULT true,
  "consecutive_count" integer NOT NULL DEFAULT 0,
  "last_evaluated_at" timestamptz,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "alert_rules_metric_check" CHECK ("metric" IN ('error_count', 'uptime_down', 'response_time')),
  CONSTRAINT "alert_rules_comparison_check" CHECK ("comparison" IN ('gt', 'gte')),
  CONSTRAINT "alert_rules_threshold_check" CHECK ("threshold" >= 0),
  CONSTRAINT "alert_rules_window_check" CHECK ("window_seconds" BETWEEN 60 AND 86400),
  CONSTRAINT "alert_rules_consecutive_breaches_check" CHECK ("consecutive_breaches" BETWEEN 1 AND 10),
  CONSTRAINT "alert_rules_consecutive_count_check" CHECK ("consecutive_count" >= 0),
  CONSTRAINT "alert_rules_project_same_organization_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "alert_rules_id_org_project_unique" ON "alert_rules" ("id", "organization_id", "project_id");
--> statement-breakpoint
CREATE INDEX "alert_rules_project_idx" ON "alert_rules" ("organization_id", "project_id", "enabled");
--> statement-breakpoint
CREATE TABLE "incidents" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL,
  "project_id" text NOT NULL,
  "alert_rule_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "title" text NOT NULL,
  "trigger_value" integer NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "last_triggered_at" timestamptz NOT NULL DEFAULT now(),
  "acknowledged_at" timestamptz,
  "acknowledged_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "incidents_status_check" CHECK ("status" IN ('open', 'acknowledged', 'resolved')),
  CONSTRAINT "incidents_project_same_organization_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "incidents_alert_rule_same_project_fk" FOREIGN KEY ("alert_rule_id", "organization_id", "project_id") REFERENCES "alert_rules"("id", "organization_id", "project_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_id_org_project_unique" ON "incidents" ("id", "organization_id", "project_id");
--> statement-breakpoint
CREATE INDEX "incidents_project_status_started_idx" ON "incidents" ("organization_id", "project_id", "status", "started_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_one_active_per_rule_unique" ON "incidents" ("alert_rule_id") WHERE "status" IN ('open', 'acknowledged');
