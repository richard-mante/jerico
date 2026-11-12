CREATE TABLE "incident_activity" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "project_id" text NOT NULL,
  "incident_id" text NOT NULL,
  "actor_id" text,
  "activity_type" text NOT NULL,
  "body" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "incident_activity_type_check" CHECK ("activity_type" IN ('opened', 'acknowledged', 'resolved', 'note')),
  CONSTRAINT "incident_activity_incident_same_project_fk" FOREIGN KEY ("incident_id", "organization_id", "project_id") REFERENCES "public"."incidents"("id", "organization_id", "project_id") ON DELETE CASCADE,
  CONSTRAINT "incident_activity_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "incident_activity_incident_created_idx" ON "incident_activity" USING btree ("incident_id", "created_at");
