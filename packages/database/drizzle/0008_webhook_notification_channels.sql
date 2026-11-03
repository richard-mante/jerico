ALTER TABLE "notification_channels" DROP CONSTRAINT "notification_channels_type_check";
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_type_check" CHECK ("type" IN ('email', 'webhook'));
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "secret_ciphertext" text;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "secret_iv" text;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "last_verification_error_code" text;
