ALTER TABLE "notification_channels" ADD COLUMN "quiet_hours_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "quiet_hours_start" text DEFAULT '22:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "quiet_hours_end" text DEFAULT '08:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;
