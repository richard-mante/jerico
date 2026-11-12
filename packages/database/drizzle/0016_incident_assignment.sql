ALTER TABLE "incidents" ADD COLUMN "assigned_to" text;
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "incident_activity" DROP CONSTRAINT "incident_activity_type_check";
--> statement-breakpoint
ALTER TABLE "incident_activity" ADD CONSTRAINT "incident_activity_type_check" CHECK ("activity_type" IN ('opened', 'acknowledged', 'resolved', 'assigned', 'note'));
