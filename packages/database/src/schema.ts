import { boolean, check, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// Better Auth core tables. Password hashing and sessions remain owned by Better Auth.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
}, (t) => [index("session_user_id_idx").on(t.userId)]);
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("account_user_id_idx").on(t.userId),
  uniqueIndex("account_provider_account_unique").on(t.providerId, t.accountId),
]);
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

// Better Auth organization plugin owns organizations, memberships, and invitations.
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: createdAt(),
});
export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("member_organization_user_unique").on(t.organizationId, t.userId),
  index("member_user_id_idx").on(t.userId),
]);
export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [
  index("invitation_organization_id_idx").on(t.organizationId),
  index("invitation_email_idx").on(t.email),
]);

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  websiteUrl: text("website_url"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("products_organization_slug_unique").on(t.organizationId, t.slug),
  uniqueIndex("products_organization_id_unique").on(t.organizationId, t.id),
]);
export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  productId: text("product_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  framework: text("framework"),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("projects_organization_slug_unique").on(t.organizationId, t.slug),
  uniqueIndex("projects_organization_id_unique").on(t.organizationId, t.id),
  index("projects_product_id_idx").on(t.productId),
  foreignKey({ name: "projects_product_same_organization_fk", columns: [t.organizationId, t.productId], foreignColumns: [products.organizationId, products.id] }),
]);
export const environments = pgTable("environments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isProduction: boolean("is_production").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("environments_project_slug_unique").on(t.projectId, t.slug),
  uniqueIndex("environments_project_id_id_unique").on(t.projectId, t.id),
  index("environments_organization_project_idx").on(t.organizationId, t.projectId),
  foreignKey({ name: "environments_project_same_organization_fk", columns: [t.organizationId, t.projectId], foreignColumns: [projects.organizationId, projects.id] }).onDelete("cascade"),
]);

export const projectIngestionKeys = pgTable("project_ingestion_keys", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  environmentId: text("environment_id").notNull(),
  name: text("name").notNull(),
  keyType: text("key_type").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  check("project_ingestion_keys_key_type_check", sql`${t.keyType} IN ('public', 'secret')`),
  uniqueIndex("project_ingestion_keys_hash_unique").on(t.keyHash),
  foreignKey({ name: "project_ingestion_keys_project_fk", columns: [t.organizationId, t.projectId], foreignColumns: [projects.organizationId, projects.id] }).onDelete("cascade"),
  foreignKey({ name: "project_ingestion_keys_environment_fk", columns: [t.projectId, t.environmentId], foreignColumns: [environments.projectId, environments.id] }).onDelete("cascade"),
  index("project_ingestion_keys_project_idx").on(t.organizationId, t.projectId),
  index("project_ingestion_keys_environment_idx").on(t.environmentId),
  index("project_ingestion_keys_active_idx").on(t.projectId, t.revokedAt),
]);

export const projectIngestionUsage = pgTable("project_ingestion_usage", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  usageDate: date("usage_date", { mode: "string" }).notNull(),
  eventCount: integer("event_count").notNull().default(0),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ name: "project_ingestion_usage_pk", columns: [t.projectId, t.usageDate] }),
  check("project_ingestion_usage_event_count_check", sql`${t.eventCount} >= 0`),
  index("project_ingestion_usage_date_idx").on(t.usageDate),
]);

export const projectIngestionRequests = pgTable("project_ingestion_requests", {
  id: text("id").primaryKey(),
  credentialId: text("credential_id").notNull().references(() => projectIngestionKeys.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  envelope: jsonb("envelope").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  check("project_ingestion_requests_status_check", sql`${t.status} IN ('pending', 'accepted')`),
  uniqueIndex("project_ingestion_requests_credential_key_unique").on(t.credentialId, t.idempotencyKey),
  index("project_ingestion_requests_expires_at_idx").on(t.expiresAt),
]);


export const projectErrorGroupStates = pgTable("project_error_group_states", {
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  status: text("status").notNull().default("open"),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ name: "project_error_group_states_pk", columns: [t.projectId, t.fingerprint] }),
  check("project_error_group_states_status_check", sql`${t.status} IN ('open', 'resolved', 'ignored')`),
  foreignKey({ name: "project_error_group_states_project_same_organization_fk", columns: [t.organizationId, t.projectId], foreignColumns: [projects.organizationId, projects.id] }).onDelete("cascade"),
  index("project_error_group_states_org_project_idx").on(t.organizationId, t.projectId),
]);
export const schema = { user, session, account, verification, organization, member, invitation, products, projects, environments, projectIngestionKeys, projectIngestionUsage, projectIngestionRequests, projectErrorGroupStates };
