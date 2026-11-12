CREATE TABLE "queue_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "queue_name" text NOT NULL,
  "payload" jsonb NOT NULL,
  "deduplication_key" text,
  "status" text NOT NULL DEFAULT 'available',
  "available_at" timestamptz NOT NULL DEFAULT now(),
  "lease_token" text,
  "lease_expires_at" timestamptz,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 5,
  "last_error_code" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  CONSTRAINT "queue_messages_status_check" CHECK ("status" IN ('available', 'leased', 'completed', 'dead_lettered')),
  CONSTRAINT "queue_messages_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" BETWEEN 1 AND 100 AND "attempts" <= "max_attempts"),
  CONSTRAINT "queue_messages_lease_pair_check" CHECK (("lease_token" IS NULL AND "lease_expires_at" IS NULL) OR ("lease_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL)),
  CONSTRAINT "queue_messages_payload_size_check" CHECK (pg_column_size("payload") <= 262144)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "queue_messages_active_dedup_unique" ON "queue_messages" ("queue_name", "deduplication_key") WHERE "deduplication_key" IS NOT NULL AND "status" IN ('available', 'leased');
--> statement-breakpoint
CREATE INDEX "queue_messages_claim_idx" ON "queue_messages" ("queue_name", "status", "available_at", "created_at");
--> statement-breakpoint
CREATE INDEX "queue_messages_expired_lease_idx" ON "queue_messages" ("queue_name", "lease_expires_at") WHERE "status" = 'leased';
--> statement-breakpoint
CREATE INDEX "queue_messages_dead_letter_idx" ON "queue_messages" ("queue_name", "completed_at") WHERE "status" = 'dead_lettered';
