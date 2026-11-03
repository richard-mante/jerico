CREATE TABLE "user" (
  "id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL, "image" text,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "session" (
  "id" text PRIMARY KEY NOT NULL, "expires_at" timestamptz NOT NULL, "token" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  "ip_address" text, "user_agent" text, "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "active_organization_id" text, CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");
--> statement-breakpoint
CREATE TABLE "account" (
  "id" text PRIMARY KEY NOT NULL, "account_id" text NOT NULL, "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" text, "refresh_token" text, "id_token" text,
  "access_token_expires_at" timestamptz, "refresh_token_expires_at" timestamptz,
  "scope" text, "password" text,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" ("provider_id", "account_id");
--> statement-breakpoint
CREATE TABLE "verification" (
  "id" text PRIMARY KEY NOT NULL, "identifier" text NOT NULL, "value" text NOT NULL,
  "expires_at" timestamptz NOT NULL, "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
--> statement-breakpoint
CREATE TABLE "organization" (
  "id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "slug" text NOT NULL,
  "logo" text, "metadata" text, "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "member" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL, "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_unique" ON "member" ("organization_id", "user_id");
--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" ("user_id");
--> statement-breakpoint
CREATE TABLE "invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "email" text NOT NULL, "role" text, "status" text NOT NULL, "expires_at" timestamptz NOT NULL,
  "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" ("organization_id");
--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" ("email");
--> statement-breakpoint
CREATE TABLE "products" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL, "slug" text NOT NULL, "description" text, "website_url" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "products_organization_slug_unique" ON "products" ("organization_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "products_organization_id_unique" ON "products" ("organization_id", "id");
--> statement-breakpoint
CREATE TABLE "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "product_id" text, "name" text NOT NULL, "slug" text NOT NULL, "framework" text,
  "platform" text NOT NULL, "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "projects_product_same_organization_fk"
    FOREIGN KEY ("organization_id", "product_id") REFERENCES "products" ("organization_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_organization_slug_unique" ON "projects" ("organization_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_organization_id_unique" ON "projects" ("organization_id", "id");
--> statement-breakpoint
CREATE INDEX "projects_product_id_idx" ON "projects" ("product_id");
--> statement-breakpoint
CREATE TABLE "environments" (
  "id" text PRIMARY KEY NOT NULL, "organization_id" text NOT NULL, "project_id" text NOT NULL,
  "name" text NOT NULL, "slug" text NOT NULL, "is_production" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "environments_project_same_organization_fk"
    FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects" ("organization_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "environments_project_slug_unique" ON "environments" ("project_id", "slug");
--> statement-breakpoint
CREATE INDEX "environments_organization_project_idx" ON "environments" ("organization_id", "project_id");
