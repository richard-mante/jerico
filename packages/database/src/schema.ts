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


export const uptimeMonitors = pgTable("uptime_monitors", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  method: text("method").notNull().default("GET"),
  intervalSeconds: integer("interval_seconds").notNull().default(60),
  timeoutMs: integer("timeout_ms").notNull().default(10000),
  expectedStatusCode: integer("expected_status_code").notNull().default(200),
  enabled: boolean("enabled").notNull().default(true),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastStatus: text("last_status"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("uptime_monitors_method_check", sql`${t.method} IN ('GET', 'HEAD')`),
  check("uptime_monitors_interval_check", sql`${t.intervalSeconds} BETWEEN 60 AND 86400`),
  check("uptime_monitors_timeout_check", sql`${t.timeoutMs} BETWEEN 1000 AND 30000`),
  check("uptime_monitors_expected_status_check", sql`${t.expectedStatusCode} BETWEEN 100 AND 599`),
  check("uptime_monitors_last_status_check", sql`${t.lastStatus} IS NULL OR ${t.lastStatus} IN ('up', 'down')`),
  uniqueIndex("uptime_monitors_id_org_project_unique").on(t.id, t.organizationId, t.projectId),
  foreignKey({ name: "uptime_monitors_project_same_organization_fk", columns: [t.organizationId, t.projectId], foreignColumns: [projects.organizationId, projects.id] }).onDelete("cascade"),
  index("uptime_monitors_project_idx").on(t.organizationId, t.projectId),
  index("uptime_monitors_due_idx").on(t.enabled, t.nextCheckAt),
]);

export const uptimeCheckResults = pgTable("uptime_check_results", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  monitorId: text("monitor_id").notNull(),
  status: text("status").notNull(),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  errorCode: text("error_code"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("uptime_check_results_status_check", sql`${t.status} IN ('up', 'down')`),
  check("uptime_check_results_status_code_check", sql`${t.statusCode} IS NULL OR ${t.statusCode} BETWEEN 100 AND 599`),
  check("uptime_check_results_response_time_check", sql`${t.responseTimeMs} IS NULL OR ${t.responseTimeMs} >= 0`),
  foreignKey({ name: "uptime_check_results_monitor_same_project_fk", columns: [t.monitorId, t.organizationId, t.projectId], foreignColumns: [uptimeMonitors.id, uptimeMonitors.organizationId, uptimeMonitors.projectId] }).onDelete("cascade"),
  index("uptime_check_results_monitor_checked_idx").on(t.monitorId, t.checkedAt),
  index("uptime_check_results_project_checked_idx").on(t.organizationId, t.projectId, t.checkedAt),
  index("uptime_check_results_checked_idx").on(t.checkedAt),
]);



export const alertRules = pgTable("alert_rules", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  metric: text("metric").notNull(),
  comparison: text("comparison").notNull().default("gte"),
  threshold: integer("threshold").notNull(),
  windowSeconds: integer("window_seconds").notNull().default(300),
  consecutiveBreaches: integer("consecutive_breaches").notNull().default(1),
  enabled: boolean("enabled").notNull().default(true),
  consecutiveCount: integer("consecutive_count").notNull().default(0),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  evaluationLeaseToken: text("evaluation_lease_token"),
  evaluationLeaseExpiresAt: timestamp("evaluation_lease_expires_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("alert_rules_metric_check", sql`${t.metric} IN ('error_count', 'uptime_down', 'response_time')`),
  check("alert_rules_comparison_check", sql`${t.comparison} IN ('gt', 'gte')`),
  check("alert_rules_threshold_check", sql`${t.threshold} >= 0`),
  check("alert_rules_window_check", sql`${t.windowSeconds} BETWEEN 60 AND 86400`),
  check("alert_rules_consecutive_breaches_check", sql`${t.consecutiveBreaches} BETWEEN 1 AND 10`),
  check("alert_rules_consecutive_count_check", sql`${t.consecutiveCount} >= 0`),
  check("alert_rules_evaluation_lease_pair_check", sql`(${t.evaluationLeaseToken} IS NULL AND ${t.evaluationLeaseExpiresAt} IS NULL) OR (${t.evaluationLeaseToken} IS NOT NULL AND ${t.evaluationLeaseExpiresAt} IS NOT NULL)`),
  uniqueIndex("alert_rules_id_org_project_unique").on(t.id, t.organizationId, t.projectId),
  foreignKey({ name: "alert_rules_project_same_organization_fk", columns: [t.organizationId, t.projectId], foreignColumns: [projects.organizationId, projects.id] }).onDelete("cascade"),
  index("alert_rules_project_idx").on(t.organizationId, t.projectId, t.enabled),
  index("alert_rules_evaluation_lease_idx").on(t.enabled, t.evaluationLeaseExpiresAt, t.lastEvaluatedAt),
]);

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  alertRuleId: text("alert_rule_id").notNull(),
  status: text("status").notNull().default("open"),
  title: text("title").notNull(),
  triggerValue: integer("trigger_value").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  acknowledgedBy: text("acknowledged_by").references(() => user.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("incidents_status_check", sql`${t.status} IN ('open', 'acknowledged', 'resolved')`),
  uniqueIndex("incidents_id_org_project_unique").on(t.id, t.organizationId, t.projectId),
  foreignKey({ name: "incidents_project_same_organization_fk", columns: [t.organizationId, t.projectId], foreignColumns: [projects.organizationId, projects.id] }).onDelete("cascade"),
  foreignKey({ name: "incidents_alert_rule_same_project_fk", columns: [t.alertRuleId, t.organizationId, t.projectId], foreignColumns: [alertRules.id, alertRules.organizationId, alertRules.projectId] }).onDelete("cascade"),
  index("incidents_project_status_started_idx").on(t.organizationId, t.projectId, t.status, t.startedAt),
  uniqueIndex("incidents_one_active_per_rule_unique").on(t.alertRuleId).where(sql`${t.status} IN ('open', 'acknowledged')`),
]);



export const notificationChannels = pgTable("notification_channels", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("email"),
  target: text("target").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationTokenHash: text("verification_token_hash"),
  verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
  secretCiphertext: text("secret_ciphertext"),
  secretIv: text("secret_iv"),
  lastVerificationErrorCode: text("last_verification_error_code"),
  lastVerificationChallengeHash: text("last_verification_challenge_hash"),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("notification_channels_type_check", sql`${t.type} IN ('email', 'webhook')`),
  uniqueIndex("notification_channels_id_org_unique").on(t.id, t.organizationId),
  uniqueIndex("notification_channels_org_type_target_unique").on(t.organizationId, t.type, t.target),
  index("notification_channels_org_enabled_idx").on(t.organizationId, t.enabled),
]);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  projectId: text("project_id").notNull(),
  incidentId: text("incident_id").notNull(),
  channelId: text("channel_id").notNull(),
  target: text("target").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  enqueueAttempts: integer("enqueue_attempts").notNull().default(1),
  nextEnqueueAt: timestamp("next_enqueue_at", { withTimezone: true }),
  enqueuedAt: timestamp("enqueued_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
  lastErrorCode: text("last_error_code"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("notification_deliveries_event_type_check", sql`${t.eventType} IN ('incident.opened', 'incident.acknowledged', 'incident.resolved')`),
  check("notification_deliveries_status_check", sql`${t.status} IN ('queued', 'sent', 'failed')`),
  check("notification_deliveries_attempts_check", sql`${t.attempts} >= 0`),
  foreignKey({ name: "notification_deliveries_incident_same_project_fk", columns: [t.incidentId, t.organizationId, t.projectId], foreignColumns: [incidents.id, incidents.organizationId, incidents.projectId] }).onDelete("cascade"),
  uniqueIndex("notification_deliveries_incident_channel_event_unique").on(t.incidentId, t.channelId, t.eventType),
  index("notification_deliveries_org_created_idx").on(t.organizationId, t.createdAt),
  index("notification_deliveries_status_idx").on(t.status, t.createdAt),
]);
export const schema = { user, session, account, verification, organization, member, invitation, products, projects, environments, projectIngestionKeys, projectIngestionUsage, projectIngestionRequests, projectErrorGroupStates, uptimeMonitors, uptimeCheckResults, alertRules, incidents, notificationChannels, notificationDeliveries };
