import { z } from "zod";

export type EnvironmentName = "development" | "staging" | "production";
export type ApiError = { error: { code: string; message: string; requestId?: string; details?: unknown } };
export type HealthStatus = { status: "ok" | "degraded"; service: string; checks?: Record<string, "ok" | "degraded" | "not-configured"> };

const nameSchema = z.string().trim().min(2).max(80);
const slugSchema = z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createProductSchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  description: z.string().trim().max(500).optional(),
  websiteUrl: z.string().url().max(2048).optional(),
}).strict();
export const createProjectSchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  productId: z.string().min(1).nullable().optional(),
  framework: z.string().trim().max(80).optional(),
  platform: z.enum(["web", "server", "desktop", "mobile", "other"]),
}).strict();
export const createEnvironmentSchema = z.object({
  name: z.string().trim().min(2).max(40),
  slug: z.string().trim().min(2).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  isProduction: z.boolean().default(false),
}).strict();
export const createOrganizationSchema = z.object({ name: nameSchema, slug: slugSchema }).strict();

export const createIngestionKeySchema = z.object({
  name: z.string().trim().min(2).max(60),
  environmentId: z.string().min(1).max(128),
  keyType: z.enum(["public", "secret"]),
}).strict();

export type IngestionKeyType = z.infer<typeof createIngestionKeySchema>["keyType"];

const telemetryAttributeValueSchema = z.union([z.string().max(2048), z.number().finite(), z.boolean(), z.null()]);
export const telemetryEventSchema = z.object({
  type: z.enum(["event", "error", "log", "metric", "span"]),
  name: z.string().trim().min(1).max(160),
  timestamp: z.string().datetime({ offset: true }).optional(),
  message: z.string().max(8192).optional(),
  value: z.number().finite().optional(),
  attributes: z.record(z.string().max(128), telemetryAttributeValueSchema).optional(),
}).strict();
export const telemetryBatchSchema = z.object({
  events: z.array(telemetryEventSchema).min(1).max(100),
}).strict();
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>;

const uptimeMonitorUrlSchema = z.string().url().max(2048).refine((value) => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const blockedSuffixes = [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".corp", ".home", ".intranet", ".private", ".arpa", ".test", ".invalid", ".example", ".onion"];
  const blockedHosts = ["localhost", "metadata", "metadata.google.internal", "metadata.azure.internal", "instance-data"];
  const isIpLiteral = hostname.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  const allowedPort = ["", "80", "443", "8080", "8443"].includes(url.port);
  return (url.protocol === "http:" || url.protocol === "https:")
    && !url.username && !url.password
    && !isIpLiteral && hostname.includes(".")
    && !blockedHosts.includes(hostname)
    && !blockedSuffixes.some((suffix) => hostname.endsWith(suffix))
    && allowedPort;
}, "Monitor URLs must use public HTTP(S), a supported web port, and no credentials or private/local hostnames.");

export const createUptimeMonitorSchema = z.object({
  name: z.string().trim().min(2).max(80),
  url: uptimeMonitorUrlSchema,
  method: z.enum(["GET", "HEAD"]).default("GET"),
  intervalSeconds: z.number().int().min(60).max(86400).default(60),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
  expectedStatusCode: z.number().int().min(100).max(599).default(200),
  enabled: z.boolean().default(true),
}).strict();

export const updateUptimeMonitorSchema = createUptimeMonitorSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export type CreateUptimeMonitor = z.infer<typeof createUptimeMonitorSchema>;
export type UpdateUptimeMonitor = z.infer<typeof updateUptimeMonitorSchema>;

export const uptimeProbeResultSchema = z.object({
  checkId: z.string().uuid(),
  monitorId: z.string().min(1).max(128),
  organizationId: z.string().min(1).max(128),
  projectId: z.string().min(1).max(128),
  status: z.enum(["up", "down"]),
  statusCode: z.number().int().min(100).max(599).nullable(),
  responseTimeMs: z.number().int().min(0).max(60000).nullable(),
  errorCode: z.enum(["unsafe_target", "unsafe_redirect", "redirect_limit", "timeout", "network_error", "unexpected_status"]).nullable(),
  checkedAt: z.string().datetime({ offset: true }),
}).strict();

export type UptimeProbeResult = z.infer<typeof uptimeProbeResultSchema>;



export const createAlertRuleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  metric: z.enum(["error_count", "uptime_down", "response_time"]),
  comparison: z.enum(["gt", "gte"]).default("gte"),
  threshold: z.number().int().min(1).max(1_000_000),
  windowSeconds: z.number().int().min(60).max(86400).default(300),
  consecutiveBreaches: z.number().int().min(1).max(10).default(1),
  enabled: z.boolean().default(true),
}).strict();
export const updateAlertRuleSchema = createAlertRuleSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
export type CreateAlertRule = z.infer<typeof createAlertRuleSchema>;
export type UpdateAlertRule = z.infer<typeof updateAlertRuleSchema>;


export const createNotificationChannelSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
}).strict();
export const verifyNotificationChannelSchema = z.object({
  token: z.string().min(32).max(128),
}).strict();
export const notificationDeliveryResultSchema = z.object({
  deliveryId: z.string().uuid(),
  status: z.enum(["attempting", "sent", "failed"]),
  providerMessageId: z.string().max(255).optional(),
  errorCode: z.enum(["provider_rejected", "provider_unavailable", "configuration_missing", "invalid_message"]).optional(),
}).strict().refine((value) => value.status !== "failed" || Boolean(value.errorCode), "Failed deliveries require a safe error code.");


export function isAllowedWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || url.search || url.hash) return false;
    if (!host.includes(".") || host.length > 253 || host.startsWith("[") || host.includes(":")) return false;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return false;
    if (["localhost", "metadata", "metadata.google.internal", "metadata.azure.internal", "instance-data"].includes(host)) return false;
    if ([".localhost", ".local", ".internal", ".test", ".invalid", ".example", ".home.arpa", ".lan", ".corp", ".home", ".intranet", ".private", ".arpa", ".onion"].some((suffix) => host.endsWith(suffix))) return false;
    return true;
  } catch {
    return false;
  }
}
export const createWebhookNotificationChannelSchema = z.object({
  url: z.string().trim().url().max(2048).refine(isAllowedWebhookUrl, "Webhook URLs must be public HTTPS endpoints on port 443 without credentials, query strings, or fragments."),
}).strict();
export const webhookVerificationResultSchema = z.object({
  channelId: z.string().uuid(),
  challenge: z.string().min(32).max(128),
  status: z.enum(["verified", "failed"]),
  errorCode: z.enum(["endpoint_rejected", "endpoint_unavailable", "invalid_response"]).optional(),
}).strict().refine((value) => value.status !== "failed" || Boolean(value.errorCode), "Failed verification requires a safe error code.");

export const API_VERSION = "v1" as const;
