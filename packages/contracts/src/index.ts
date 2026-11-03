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
export const API_VERSION = "v1" as const;
