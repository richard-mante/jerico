CREATE TABLE "notification_channels" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL,
  "type" text NOT NULL DEFAULT 'email',
  "target" text NOT NULL,
  "verified_at" timestamptz,
  "verification_token_hash" text,
  "verification_expires_at" timestamptz,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "notification_channels_type_check" CHECK ("type" IN ('email'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_channels_id_org_unique" ON "notification_channels" ("id", "organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_channels_org_type_target_unique" ON "notification_channels" ("organization_id", "type", "target");
--> statement-breakpoint
CREATE INDEX "notification_channels_org_enabled_idx" ON "notification_channels" ("organization_id", "enabled");
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL,
  "project_id" text NOT NULL,
  "incident_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "target" text NOT NULL,
  "event_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "attempts" integer NOT NULL DEFAULT 0,
  "provider_message_id" text,
  "last_error_code" text,
  "last_attempt_at" timestamptz,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "notification_deliveries_event_type_check" CHECK ("event_type" IN ('incident.opened', 'incident.acknowledged', 'incident.resolved')),
  CONSTRAINT "notification_deliveries_status_check" CHECK ("status" IN ('queued', 'sent', 'failed')),
  CONSTRAINT "notification_deliveries_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "notification_deliveries_incident_same_project_fk" FOREIGN KEY ("incident_id", "organization_id", "project_id") REFERENCES "incidents"("id", "organization_id", "project_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_incident_channel_event_unique" ON "notification_deliveries" ("incident_id", "channel_id", "event_type");
--> statement-breakpoint
CREATE INDEX "notification_deliveries_org_created_idx" ON "notification_deliveries" ("organization_id", "created_at");
--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" ("status", "created_at");
