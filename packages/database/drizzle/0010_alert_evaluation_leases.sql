ALTER TABLE "alert_rules" ADD COLUMN "evaluation_lease_token" text;
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "evaluation_lease_expires_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_evaluation_lease_pair_check"
  CHECK (("evaluation_lease_token" IS NULL AND "evaluation_lease_expires_at" IS NULL)
    OR ("evaluation_lease_token" IS NOT NULL AND "evaluation_lease_expires_at" IS NOT NULL));
--> statement-breakpoint
CREATE INDEX "alert_rules_evaluation_lease_idx"
  ON "alert_rules" ("enabled", "evaluation_lease_expires_at", "last_evaluated_at");
