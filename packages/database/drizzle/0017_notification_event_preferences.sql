ALTER TABLE "notification_channels" ADD COLUMN "notify_on_opened" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "notify_on_acknowledged" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "notify_on_resolved" boolean DEFAULT true NOT NULL;
