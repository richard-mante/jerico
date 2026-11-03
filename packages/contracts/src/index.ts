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
export const API_VERSION = "v1" as const;
