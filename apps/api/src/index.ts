import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import {
  createAlertRuleSchema,
  updateAlertRuleSchema,
  createEnvironmentSchema,
  createIngestionKeySchema,
  createOrganizationSchema,
  createProductSchema,
  createProjectSchema,
  createUptimeMonitorSchema,
  updateUptimeMonitorSchema,
  uptimeProbeResultSchema,
} from "@jerico/contracts";
import { alertRules, environments, incidents, member, products, projectErrorGroupStates, projectIngestionKeys, projects, uptimeCheckResults, uptimeMonitors } from "@jerico/database/schema";
import { createAuth } from "./auth";
import { canManageOrganizationResources } from "./permissions";
import { withDatabase, type ApiBindings, type JericoDatabase } from "./database";
import { createIngestionCredential } from "./ingestion-keys";
import { pruneUptimeCheckHistory, scheduleDueUptimeMonitors } from "./uptime-scheduler";
import { evaluateAlertRules } from "./alert-evaluator";
import { decodeTelemetryCursor, encodeTelemetryCursor, parseQueryLimit, parseTimeRange, queryTelemetry, queryTelemetryErrorGroups, queryTelemetryEventCatalogue, queryTelemetryEventSeries, queryTelemetryMetricSeries, queryTelemetryOverview, queryTelemetryRoutePerformance, type TelemetryQueryBindings, type TelemetryRow } from "./telemetry-query";

type Variables = { requestId: string };
type AppEnvironment = { Bindings: ApiBindings & TelemetryQueryBindings; Variables: Variables };
type ApiContext = Context<AppEnvironment>;
const app = new Hono<AppEnvironment>();

app.use("*", async (context, next) => {
  const requestId = context.req.header("x-request-id") ?? crypto.randomUUID();
  context.set("requestId", requestId);
  context.header("x-request-id", requestId);
  await next();
});

app.use("/api/*", cors({
  origin: (origin, context) => origin === (context.env.WEB_APP_URL ?? "http://localhost:3000") ? origin : "",
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-Jerico-Organization-Id"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 600,
}));

app.get("/", (context) => context.json({
  name: "Jerico API", version: "v1", status: "phase-5-alert-rules",
  documentation: "https://github.com/richard-mante/jerico",
}));
app.get("/health", (context) => context.json({
  status: "ok", service: "api", environment: context.env.APP_ENV ?? "development",
  checks: { database: context.env.HYPERDRIVE || context.env.DATABASE_URL ? "configured" : "not-configured" },
}));

app.on(["GET", "POST"], "/api/auth/*", async (context) => withDatabase(context.env, async (database) => {
  const auth = createAuth(database, context.env);
  return auth.handler(context.req.raw);
}));

app.get("/api/v1/me", async (context) => withDatabase(context.env, async (database) => {
  const auth = createAuth(database, context.env);
  const session = await auth.api.getSession({ headers: context.req.raw.headers });
  if (!session) return context.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, 401);
  return context.json({ user: session.user, session: session.session });
}));

async function withOrganization(
  context: ApiContext,
  callback: (database: JericoDatabase, organizationId: string, role: string, userId: string) => Promise<Response>,
): Promise<Response> {
  return withDatabase(context.env, async (database) => {
    const auth = createAuth(database, context.env);
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, 401);

    const organizationId = context.req.header("X-Jerico-Organization-Id") ?? session.session.activeOrganizationId;
    if (!organizationId) return context.json({ error: { code: "ORGANIZATION_REQUIRED", message: "Select an organization first." } }, 400);

    const [membership] = await database.select({ role: member.role }).from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, session.user.id))).limit(1);
    if (!membership) return context.json({ error: { code: "FORBIDDEN", message: "You do not belong to this organization." } }, 403);
    return callback(database, organizationId, membership.role, session.user.id);
  });
}



async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.body) throw new SyntaxError("Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RangeError("Request payload is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function makeSlug(value: string): string {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return slug || "resource";
}
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

app.get("/api/v1/organizations", async (context) => withDatabase(context.env, async (database) => {
  const auth = createAuth(database, context.env);
  const session = await auth.api.getSession({ headers: context.req.raw.headers });
  if (!session) return context.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, 401);
  return context.json({ data: await auth.api.listOrganizations({ headers: context.req.raw.headers }) });
}));

app.post("/api/v1/organizations", async (context) => withDatabase(context.env, async (database) => {
  const auth = createAuth(database, context.env);
  const session = await auth.api.getSession({ headers: context.req.raw.headers });
  if (!session) return context.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, 401);
  const parsed = createOrganizationSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "VALIDATION_ERROR", message: "Provide a valid organization name and slug." } }, 400);
  const result = await auth.api.createOrganization({
    body: { name: parsed.data.name, slug: parsed.data.slug },
    headers: context.req.raw.headers,
  });
  return context.json({ data: result }, 201);
}));

app.get("/api/v1/products", async (context) => withOrganization(context, async (database, organizationId) => {
  const rows = await database.select().from(products).where(eq(products.organizationId, organizationId)).orderBy(asc(products.name));
  return context.json({ data: rows });
}));
app.post("/api/v1/products", async (context) => withOrganization(context, async (database, organizationId, role) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot create products." } }, 403);
  const parsed = createProductSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "VALIDATION_ERROR", message: "The product details are invalid.", details: parsed.error.flatten() } }, 400);
  try {
    const [created] = await database.insert(products).values({
      id: crypto.randomUUID(), organizationId, name: parsed.data.name, slug: parsed.data.slug ?? makeSlug(parsed.data.name),
      description: parsed.data.description ?? null, websiteUrl: parsed.data.websiteUrl ?? null,
    }).returning();
    return context.json({ data: created }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return context.json({ error: { code: "SLUG_CONFLICT", message: "A product with this slug already exists in the organization." } }, 409);
    throw error;
  }
}));

app.get("/api/v1/projects", async (context) => withOrganization(context, async (database, organizationId) => {
  const rows = await database.select().from(projects).where(eq(projects.organizationId, organizationId)).orderBy(asc(projects.name));
  return context.json({ data: rows });
}));
app.post("/api/v1/projects", async (context) => withOrganization(context, async (database, organizationId, role) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot create projects." } }, 403);
  const parsed = createProjectSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "VALIDATION_ERROR", message: "The project details are invalid.", details: parsed.error.flatten() } }, 400);
  try {
    const created = await database.transaction(async (transaction) => {
      const [project] = await transaction.insert(projects).values({
        id: crypto.randomUUID(), organizationId, name: parsed.data.name, slug: parsed.data.slug ?? makeSlug(parsed.data.name),
        productId: parsed.data.productId ?? null, framework: parsed.data.framework ?? null, platform: parsed.data.platform,
      }).returning();
      await transaction.insert(environments).values([
        { id: crypto.randomUUID(), organizationId, projectId: project.id, name: "Development", slug: "development", isProduction: false },
        { id: crypto.randomUUID(), organizationId, projectId: project.id, name: "Production", slug: "production", isProduction: true },
      ]);
      return project;
    });
    return context.json({ data: created }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return context.json({ error: { code: "SLUG_CONFLICT", message: "A project with this slug already exists in the organization." } }, 409);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23503") {
      return context.json({ error: { code: "INVALID_PRODUCT", message: "The selected product does not belong to this organization." } }, 400);
    }
    throw error;
  }
}));


async function listProjectTelemetry(
  context: ApiContext,
  eventType: "event" | "error" | "log" | "metric" | "span",
): Promise<Response> {
  return withOrganization(context, async (database, organizationId) => {
    const projectId = context.req.param("projectId");
    const [project] = await database.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
    if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);

    const environmentId = context.req.query("environmentId");
    if (environmentId) {
      const [environment] = await database.select({ id: environments.id }).from(environments)
        .where(and(
          eq(environments.id, environmentId),
          eq(environments.projectId, projectId),
          eq(environments.organizationId, organizationId),
        )).limit(1);
      if (!environment) return context.json({ error: { code: "INVALID_ENVIRONMENT", message: "The environment does not belong to this project." } }, 400);
    }

    if (!context.env.CLICKHOUSE_URL) {
      return context.json({ error: { code: "TELEMETRY_UNAVAILABLE", message: "Telemetry query storage is not configured." } }, 503);
    }
    const range = parseTimeRange(context.req.query("from"), context.req.query("to"));
    if (!range) return context.json({ error: { code: "INVALID_TIME_RANGE", message: "Provide a valid time range no longer than 31 days and not in the future." } }, 400);
    const limit = parseQueryLimit(context.req.query("limit"));
    if (limit === null) return context.json({ error: { code: "INVALID_LIMIT", message: "Limit must be an integer between 1 and 100." } }, 400);
    const levelValue = eventType === "log" ? context.req.query("level") : undefined;
    const validLogLevels = ["debug", "info", "warn", "error", "fatal"] as const;
    if (levelValue && !validLogLevels.includes(levelValue as typeof validLogLevels[number])) {
      return context.json({ error: { code: "INVALID_LOG_LEVEL", message: "Log level must be debug, info, warn, error, or fatal." } }, 400);
    }
    const logLevel = levelValue as typeof validLogLevels[number] | undefined;
    const traceIdValue = eventType === "span" ? context.req.query("traceId") : undefined;
    if (traceIdValue !== undefined && (traceIdValue.length < 1 || traceIdValue.length > 256)) {
      return context.json({ error: { code: "INVALID_TRACE_ID", message: "Trace ID must be between 1 and 256 characters." } }, 400);
    }
    const cursorValue = context.req.query("cursor");
    const cursor = decodeTelemetryCursor(cursorValue);
    if (cursorValue && !cursor) return context.json({ error: { code: "INVALID_CURSOR", message: "The pagination cursor is invalid." } }, 400);

    try {
      const rows = await queryTelemetry<TelemetryRow>(context.env, {
        organizationId, projectId, environmentId, ...range, limit, cursor: cursor ?? undefined, eventType, logLevel, traceId: traceIdValue,
      });
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);
      const last = data[data.length - 1];
      return context.json({
        data,
        pagination: {
          limit,
          hasMore,
          nextCursor: hasMore && last ? encodeTelemetryCursor({ timestamp: last.timestamp, eventId: last.eventId }) : null,
        },
        filters: { from: range.from, to: range.to, environmentId: environmentId ?? null, eventType, logLevel: logLevel ?? null },
      });
    } catch (error) {
      console.error("Jerico telemetry query failed", {
        requestId: context.get("requestId"),
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      return context.json({ error: { code: "TELEMETRY_QUERY_FAILED", message: "Telemetry could not be queried right now.", requestId: context.get("requestId") } }, 502);
    }
  });
}

app.get("/api/v1/projects/:projectId/telemetry/events", (context) => listProjectTelemetry(context, "event"));
app.get("/api/v1/projects/:projectId/telemetry/errors", (context) => listProjectTelemetry(context, "error"));
app.get("/api/v1/projects/:projectId/telemetry/logs", (context) => listProjectTelemetry(context, "log"));
app.get("/api/v1/projects/:projectId/telemetry/metrics", (context) => listProjectTelemetry(context, "metric"));
app.get("/api/v1/projects/:projectId/telemetry/spans", (context) => listProjectTelemetry(context, "span"));

app.get("/api/v1/projects/:projectId/telemetry/errors/groups", async (context) => withOrganization(context, async (database, organizationId, role) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const environmentId = context.req.query("environmentId");
  if (environmentId) {
    const [environment] = await database.select({ id: environments.id }).from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId), eq(environments.organizationId, organizationId))).limit(1);
    if (!environment) return context.json({ error: { code: "INVALID_ENVIRONMENT", message: "The environment does not belong to this project." } }, 400);
  }
  if (!context.env.CLICKHOUSE_URL) return context.json({ error: { code: "TELEMETRY_UNAVAILABLE", message: "Telemetry query storage is not configured." } }, 503);
  const range = parseTimeRange(context.req.query("from"), context.req.query("to"));
  if (!range) return context.json({ error: { code: "INVALID_TIME_RANGE", message: "Provide a valid time range no longer than 31 days and not in the future." } }, 400);
  const limit = parseQueryLimit(context.req.query("limit"));
  if (limit === null) return context.json({ error: { code: "INVALID_LIMIT", message: "Limit must be an integer between 1 and 100." } }, 400);
  try {
    const groups = await queryTelemetryErrorGroups(context.env, { organizationId, projectId, environmentId, ...range, limit });
    const states = await database.select({ fingerprint: projectErrorGroupStates.fingerprint, status: projectErrorGroupStates.status })
      .from(projectErrorGroupStates).where(and(eq(projectErrorGroupStates.organizationId, organizationId), eq(projectErrorGroupStates.projectId, projectId)));
    const stateByFingerprint = new Map(states.map((state) => [state.fingerprint, state.status]));
    const data = groups.map((group) => ({ ...group, status: stateByFingerprint.get(group.fingerprint) ?? "open" }));
    return context.json({ data, canManage: canManageOrganizationResources(role), filters: { ...range, environmentId: environmentId ?? null }, limit });
  } catch (error) {
    console.error("Jerico telemetry error-group query failed", {
      requestId: context.get("requestId"),
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return context.json({ error: { code: "TELEMETRY_QUERY_FAILED", message: "Error groups could not be loaded right now.", requestId: context.get("requestId") } }, 502);
  }
}));

app.get("/api/v1/projects/:projectId/telemetry/errors/groups/:fingerprint/occurrences", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const fingerprint = context.req.param("fingerprint");
  if (!/^[0-9]{1,20}$/.test(fingerprint)) return context.json({ error: { code: "INVALID_FINGERPRINT", message: "The error group fingerprint is invalid." } }, 400);
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const environmentId = context.req.query("environmentId");
  if (environmentId) {
    const [environment] = await database.select({ id: environments.id }).from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId), eq(environments.organizationId, organizationId))).limit(1);
    if (!environment) return context.json({ error: { code: "INVALID_ENVIRONMENT", message: "The environment does not belong to this project." } }, 400);
  }
  if (!context.env.CLICKHOUSE_URL) return context.json({ error: { code: "TELEMETRY_UNAVAILABLE", message: "Telemetry query storage is not configured." } }, 503);
  const range = parseTimeRange(context.req.query("from"), context.req.query("to"));
  if (!range) return context.json({ error: { code: "INVALID_TIME_RANGE", message: "Provide a valid time range no longer than 31 days and not in the future." } }, 400);
  const limit = parseQueryLimit(context.req.query("limit"));
  if (limit === null) return context.json({ error: { code: "INVALID_LIMIT", message: "Limit must be an integer between 1 and 100." } }, 400);
  const cursorValue = context.req.query("cursor");
  const cursor = cursorValue ? decodeTelemetryCursor(cursorValue) : null;
  if (cursorValue && !cursor) return context.json({ error: { code: "INVALID_CURSOR", message: "The pagination cursor is invalid." } }, 400);
  try {
    const rows = await queryTelemetry(context.env, { organizationId, projectId, environmentId, ...range, limit, cursor: cursor ?? undefined, eventType: "error", errorFingerprint: fingerprint });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeTelemetryCursor({ timestamp: last.timestamp, eventId: last.eventId }) : null;
    return context.json({ data, pagination: { limit, hasMore, nextCursor }, filters: { ...range, environmentId: environmentId ?? null, fingerprint } });
  } catch (error) {
    console.error("Jerico telemetry error occurrence query failed", { requestId: context.get("requestId"), projectId, error: error instanceof Error ? error.message : String(error) });
    return context.json({ error: { code: "TELEMETRY_QUERY_FAILED", message: "Error occurrences could not be loaded right now.", requestId: context.get("requestId") } }, 502);
  }
}));
app.post("/api/v1/projects/:projectId/telemetry/errors/groups/:fingerprint/status", async (context) => withOrganization(context, async (database, organizationId, role, userId) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Only organization owners and admins can change error group status." } }, 403);
  const projectId = context.req.param("projectId");
  const fingerprint = context.req.param("fingerprint");
  if (!/^[0-9]{1,20}$/.test(fingerprint)) return context.json({ error: { code: "INVALID_FINGERPRINT", message: "The error group fingerprint is invalid." } }, 400);
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const body = await context.req.json().catch(() => null) as { status?: unknown } | null;
  const allowedStatuses = ["open", "resolved", "ignored"] as const;
  if (!body || typeof body.status !== "string" || !allowedStatuses.includes(body.status as typeof allowedStatuses[number])) {
    return context.json({ error: { code: "INVALID_ERROR_GROUP_STATUS", message: "Status must be open, resolved, or ignored." } }, 400);
  }
  const status = body.status as typeof allowedStatuses[number];
  try {
    await database.insert(projectErrorGroupStates).values({ organizationId, projectId, fingerprint, status, updatedBy: userId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [projectErrorGroupStates.projectId, projectErrorGroupStates.fingerprint],
        set: { organizationId, status, updatedBy: userId, updatedAt: new Date() },
      });
    return context.json({ data: { fingerprint, status } });
  } catch (error) {
    console.error("Jerico error group status update failed", { requestId: context.get("requestId"), projectId, error: error instanceof Error ? error.message : String(error) });
    return context.json({ error: { code: "ERROR_GROUP_UPDATE_FAILED", message: "Error group status could not be updated." } }, 502);
  }
}));
app.get("/api/v1/projects/:projectId/telemetry/metrics/series", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const environmentId = context.req.query("environmentId");
  if (environmentId) {
    const [environment] = await database.select({ id: environments.id }).from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId), eq(environments.organizationId, organizationId))).limit(1);
    if (!environment) return context.json({ error: { code: "INVALID_ENVIRONMENT", message: "The environment does not belong to this project." } }, 400);
  }
  if (!context.env.CLICKHOUSE_URL) return context.json({ error: { code: "TELEMETRY_UNAVAILABLE", message: "Telemetry query storage is not configured." } }, 503);
  const range = parseTimeRange(context.req.query("from"), context.req.query("to"));
  if (!range) return context.json({ error: { code: "INVALID_TIME_RANGE", message: "Provide a valid time range no longer than 31 days and not in the future." } }, 400);
  const durationHours = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 3_600_000;
  const bucketMinutes: 1 | 15 | 60 | 360 = durationHours <= 2 ? 1 : durationHours <= 48 ? 15 : durationHours <= 240 ? 60 : 360;
  try {
    const data = await queryTelemetryMetricSeries(context.env, { organizationId, projectId, environmentId, ...range, bucketMinutes });
    return context.json({ data, filters: { ...range, environmentId: environmentId ?? null, bucketMinutes } });
  } catch (error) {
    console.error("Jerico telemetry metric-series query failed", { requestId: context.get("requestId"), projectId, error: error instanceof Error ? error.message : String(error) });
    return context.json({ error: { code: "TELEMETRY_QUERY_FAILED", message: "Metric series could not be loaded right now.", requestId: context.get("requestId") } }, 502);
  }
}));
app.get("/api/v1/projects/:projectId/telemetry/metrics/routes", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const environmentId = context.req.query("environmentId");
  if (environmentId) {
    const [environment] = await database.select({ id: environments.id }).from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId), eq(environments.organizationId, organizationId))).limit(1);
    if (!environment) return context.json({ error: { code: "INVALID_ENVIRONMENT", message: "The environment does not belong to this project." } }, 400);
  }
  if (!context.env.CLICKHOUSE_URL) return context.json({ error: { code: "TELEMETRY_UNAVAILABLE", message: "Telemetry query storage is not configured." } }, 503);
  const range = parseTimeRange(context.req.query("from"), context.req.query("to"));
  if (!range) return context.json({ error: { code: "INVALID_TIME_RANGE", message: "Provide a valid time range no longer than 31 days and not in the future." } }, 400);
  try {
    const data = await queryTelemetryRoutePerformance(context.env, { organizationId, projectId, environmentId, ...range });
    return context.json({ data, filters: { ...range, environmentId: environmentId ?? null } });
  } catch (error) {
    console.error("Jerico telemetry route-performance query failed", { requestId: context.get("requestId"), projectId, error: error instanceof Error ? error.message : String(error) });
    return context.json({ error: { code: "TELEMETRY_QUERY_FAILED", message: "Route performance could not be queried right now.", requestId: context.get("requestId") } }, 502);
  }
}));
app.get("/api/v1/projects/:projectId/telemetry/events/series", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const environmentId = context.req.query("environmentId");
  if (environmentId) {
    const [environment] = await database.select({ id: environments.id }).from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId), eq(environments.organizationId, organizationId))).limit(1);
    if (!environment) return context.json({ error: { code: "INVALID_ENVIRONMENT", message: "The environment does not belong to this project." } }, 400);
  }
  if (!context.env.CLICKHOUSE_URL) return context.json({ error: { code: "TELEMETRY_UNAVAILABLE", message: "Telemetry query storage is not configured." } }, 503);
  const range = parseTimeRange(context.req.query("from"), context.req.query("to"));
  if (!range) return context.json({ error: { code: "INVALID_TIME_RANGE", message: "Provide a valid time range no longer than 31 days and not in the future." } }, 400);
  const durationHours = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 3_600_000;
  const bucketMinutes: 1 | 15 | 60 | 360 = durationHours <= 2 ? 1 : durationHours <= 48 ? 15 : durationHours <= 240 ? 60 : 360;
  try {
    const data = await queryTelemetryEventSeries(context.env, { organizationId, projectId, environmentId, ...range, bucketMinutes });
    return context.json({ data, filters: { ...range, environmentId: environmentId ?? null, bucketMinutes } });
  } catch (error) {
    console.error("Jerico telemetry event-series query failed", { requestId: context.get("requestId"), projectId, error: error instanceof Error ? error.message : String(error) });
    return context.json({ error: { code: "TELEMETRY_QUERY_FAILED", message: "Event time series could not be loaded right now.", requestId: context.get("requestId") } }, 502);
  }
}));
app.get("/api/v1/projects/:projectId/telemetry/events/catalogue", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const environmentId = context.req.query("environmentId");
  if (environmentId) {
    const [environment] = await database.select({ id: environments.id }).from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId), eq(environments.organizationId, organizationId))).limit(1);
    if (!environment) return context.json({ error: { code: "INVALID_ENVIRONMENT", message: "The environment does not belong to this project." } }, 400);
  }
  if (!context.env.CLICKHOUSE_URL) return context.json({ error: { code: "TELEMETRY_UNAVAILABLE", message: "Telemetry query storage is not configured." } }, 503);
  const range = parseTimeRange(context.req.query("from"), context.req.query("to"));
  if (!range) return context.json({ error: { code: "INVALID_TIME_RANGE", message: "Provide a valid time range no longer than 31 days and not in the future." } }, 400);
  try {
    const data = await queryTelemetryEventCatalogue(context.env, { organizationId, projectId, environmentId, ...range });
    return context.json({ data, filters: { ...range, environmentId: environmentId ?? null }, limit: 100 });
  } catch (error) {
    console.error("Jerico telemetry event-catalogue query failed", { requestId: context.get("requestId"), projectId, error: error instanceof Error ? error.message : String(error) });
    return context.json({ error: { code: "TELEMETRY_QUERY_FAILED", message: "Event catalogue could not be loaded right now.", requestId: context.get("requestId") } }, 502);
  }
}));
app.get("/api/v1/projects/:projectId/telemetry/overview", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const environmentId = context.req.query("environmentId");
  if (environmentId) {
    const [environment] = await database.select({ id: environments.id }).from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId), eq(environments.organizationId, organizationId))).limit(1);
    if (!environment) return context.json({ error: { code: "INVALID_ENVIRONMENT", message: "The environment does not belong to this project." } }, 400);
  }
  if (!context.env.CLICKHOUSE_URL) return context.json({ error: { code: "TELEMETRY_UNAVAILABLE", message: "Telemetry query storage is not configured." } }, 503);
  const range = parseTimeRange(context.req.query("from"), context.req.query("to"));
  if (!range) return context.json({ error: { code: "INVALID_TIME_RANGE", message: "Provide a valid time range no longer than 31 days and not in the future." } }, 400);
  try {
    const data = await queryTelemetryOverview(context.env, { organizationId, projectId, environmentId, ...range });
    return context.json({ data, filters: { ...range, environmentId: environmentId ?? null } });
  } catch (error) {
    console.error("Jerico telemetry overview query failed", {
      requestId: context.get("requestId"),
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return context.json({ error: { code: "TELEMETRY_QUERY_FAILED", message: "Telemetry overview could not be loaded right now.", requestId: context.get("requestId") } }, 502);
  }
}));

app.get("/api/v1/projects/:projectId/keys", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);

  const rows = await database.select({
    id: projectIngestionKeys.id,
    name: projectIngestionKeys.name,
    keyType: projectIngestionKeys.keyType,
    keyPrefix: projectIngestionKeys.keyPrefix,
    environmentId: projectIngestionKeys.environmentId,
    environmentName: environments.name,
    createdAt: projectIngestionKeys.createdAt,
    lastUsedAt: projectIngestionKeys.lastUsedAt,
    revokedAt: projectIngestionKeys.revokedAt,
  }).from(projectIngestionKeys)
    .leftJoin(environments, eq(projectIngestionKeys.environmentId, environments.id))
    .where(and(eq(projectIngestionKeys.organizationId, organizationId), eq(projectIngestionKeys.projectId, projectId)))
    .orderBy(desc(projectIngestionKeys.createdAt));
  return context.json({ data: rows });
}));

app.post("/api/v1/projects/:projectId/keys", async (context) => withOrganization(context, async (database, organizationId, role, userId) => {
  if (!canManageOrganizationResources(role)) {
    return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot create ingestion keys." } }, 403);
  }
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);

  const parsed = createIngestionKeySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    return context.json({ error: { code: "VALIDATION_ERROR", message: "The ingestion key details are invalid.", details: parsed.error.flatten() } }, 400);
  }
  const [environment] = await database.select({ id: environments.id }).from(environments)
    .where(and(
      eq(environments.id, parsed.data.environmentId),
      eq(environments.projectId, projectId),
      eq(environments.organizationId, organizationId),
    )).limit(1);
  if (!environment) {
    return context.json({ error: { code: "INVALID_ENVIRONMENT", message: "The environment does not belong to this project." } }, 400);
  }

  const credential = await createIngestionCredential(parsed.data.keyType);
  const [created] = await database.insert(projectIngestionKeys).values({
    id: crypto.randomUUID(),
    organizationId,
    projectId,
    environmentId: environment.id,
    name: parsed.data.name,
    keyType: parsed.data.keyType,
    keyPrefix: credential.keyPrefix,
    keyHash: credential.keyHash,
    createdBy: userId,
  }).returning({
    id: projectIngestionKeys.id,
    name: projectIngestionKeys.name,
    keyType: projectIngestionKeys.keyType,
    keyPrefix: projectIngestionKeys.keyPrefix,
    environmentId: projectIngestionKeys.environmentId,
    createdAt: projectIngestionKeys.createdAt,
  });

  // The raw credential is returned exactly once. It is never persisted or listed.
  return context.json({ data: { ...created, rawKey: credential.rawKey } }, 201);
}));

app.delete("/api/v1/projects/:projectId/keys/:keyId", async (context) => withOrganization(context, async (database, organizationId, role) => {
  if (!canManageOrganizationResources(role)) {
    return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot revoke ingestion keys." } }, 403);
  }
  const projectId = context.req.param("projectId");
  const keyId = context.req.param("keyId");
  const [revoked] = await database.update(projectIngestionKeys).set({ revokedAt: new Date() })
    .where(and(
      eq(projectIngestionKeys.id, keyId),
      eq(projectIngestionKeys.organizationId, organizationId),
      eq(projectIngestionKeys.projectId, projectId),
      isNull(projectIngestionKeys.revokedAt),
    )).returning({ id: projectIngestionKeys.id, revokedAt: projectIngestionKeys.revokedAt });
  if (!revoked) {
    const [existing] = await database.select({ id: projectIngestionKeys.id, revokedAt: projectIngestionKeys.revokedAt })
      .from(projectIngestionKeys).where(and(
        eq(projectIngestionKeys.id, keyId),
        eq(projectIngestionKeys.organizationId, organizationId),
        eq(projectIngestionKeys.projectId, projectId),
      )).limit(1);
    if (!existing) return context.json({ error: { code: "NOT_FOUND", message: "Ingestion key not found." } }, 404);
    return context.json({ error: { code: "KEY_ALREADY_REVOKED", message: "This ingestion key has already been revoked." } }, 409);
  }
  return context.json({ data: revoked });
}));

app.get("/api/v1/projects/:projectId/environments", async (context) => withOrganization(context, async (database, organizationId) => {
  const rows = await database.select().from(environments)
    .where(and(eq(environments.organizationId, organizationId), eq(environments.projectId, context.req.param("projectId"))))
    .orderBy(asc(environments.name));
  return context.json({ data: rows });
}));
app.post("/api/v1/projects/:projectId/environments", async (context) => withOrganization(context, async (database, organizationId, role) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot create environments." } }, 403);
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const parsed = createEnvironmentSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "VALIDATION_ERROR", message: "The environment details are invalid.", details: parsed.error.flatten() } }, 400);
  try {
    const [created] = await database.insert(environments).values({
      id: crypto.randomUUID(), organizationId, projectId, name: parsed.data.name,
      slug: parsed.data.slug ?? makeSlug(parsed.data.name), isProduction: parsed.data.isProduction,
    }).returning();
    return context.json({ data: created }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return context.json({ error: { code: "SLUG_CONFLICT", message: "An environment with this slug already exists for the project." } }, 409);
    throw error;
  }
}));



app.get("/api/v1/projects/:projectId/alert-rules", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const data = await database.select().from(alertRules)
    .where(and(eq(alertRules.organizationId, organizationId), eq(alertRules.projectId, projectId)))
    .orderBy(desc(alertRules.createdAt));
  return context.json({ data });
}));

app.post("/api/v1/projects/:projectId/alert-rules", async (context) => withOrganization(context, async (database, organizationId, role, userId) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot manage alert rules." } }, 403);
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const parsed = createAlertRuleSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "VALIDATION_ERROR", message: "The alert rule details are invalid.", details: parsed.error.flatten() } }, 400);
  const [created] = await database.insert(alertRules).values({
    id: crypto.randomUUID(), organizationId, projectId, createdBy: userId, ...parsed.data,
  }).returning();
  return context.json({ data: created }, 201);
}));

app.patch("/api/v1/projects/:projectId/alert-rules/:ruleId", async (context) => withOrganization(context, async (database, organizationId, role) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot manage alert rules." } }, 403);
  const projectId = context.req.param("projectId");
  const ruleId = context.req.param("ruleId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const parsed = updateAlertRuleSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "VALIDATION_ERROR", message: "Provide valid alert rule fields.", details: parsed.error.flatten() } }, 400);
  const [updated] = await database.update(alertRules).set({ ...parsed.data, consecutiveCount: 0, updatedAt: new Date() })
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.projectId, projectId), eq(alertRules.organizationId, organizationId))).returning();
  if (!updated) return context.json({ error: { code: "NOT_FOUND", message: "Alert rule not found in this project." } }, 404);
  return context.json({ data: updated });
}));

app.delete("/api/v1/projects/:projectId/alert-rules/:ruleId", async (context) => withOrganization(context, async (database, organizationId, role) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot manage alert rules." } }, 403);
  const projectId = context.req.param("projectId");
  const [deleted] = await database.delete(alertRules)
    .where(and(eq(alertRules.id, context.req.param("ruleId")), eq(alertRules.projectId, projectId), eq(alertRules.organizationId, organizationId)))
    .returning({ id: alertRules.id });
  if (!deleted) return context.json({ error: { code: "NOT_FOUND", message: "Alert rule not found in this project." } }, 404);
  return context.json({ data: { deleted: true } });
}));

app.get("/api/v1/projects/:projectId/incidents", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const limit = parseQueryLimit(context.req.query("limit"));
  if (limit === null) return context.json({ error: { code: "INVALID_LIMIT", message: "Limit must be an integer between 1 and 100." } }, 400);
  const status = context.req.query("status");
  if (status && !["open", "acknowledged", "resolved"].includes(status)) return context.json({ error: { code: "INVALID_STATUS", message: "Status must be open, acknowledged, or resolved." } }, 400);
  const filters = [eq(incidents.organizationId, organizationId), eq(incidents.projectId, projectId)];
  if (status) filters.push(eq(incidents.status, status));
  const data = await database.select().from(incidents).where(and(...filters)).orderBy(desc(incidents.startedAt)).limit(limit);
  return context.json({ data });
}));

app.post("/api/v1/projects/:projectId/incidents/:incidentId/acknowledge", async (context) => withOrganization(context, async (database, organizationId, _role, userId) => {
  const [updated] = await database.update(incidents).set({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: userId, updatedAt: new Date() })
    .where(and(eq(incidents.id, context.req.param("incidentId")), eq(incidents.projectId, context.req.param("projectId")), eq(incidents.organizationId, organizationId), eq(incidents.status, "open"))).returning();
  if (!updated) {
    const [existing] = await database.select({ id: incidents.id, status: incidents.status }).from(incidents)
      .where(and(eq(incidents.id, context.req.param("incidentId")), eq(incidents.projectId, context.req.param("projectId")), eq(incidents.organizationId, organizationId))).limit(1);
    if (!existing) return context.json({ error: { code: "NOT_FOUND", message: "Incident not found in this project." } }, 404);
    return context.json({ data: existing });
  }
  return context.json({ data: updated });
}));

app.post("/api/v1/projects/:projectId/incidents/:incidentId/resolve", async (context) => withOrganization(context, async (database, organizationId) => {
  const now = new Date();
  const [updated] = await database.update(incidents).set({ status: "resolved", resolvedAt: now, updatedAt: now })
    .where(and(eq(incidents.id, context.req.param("incidentId")), eq(incidents.projectId, context.req.param("projectId")), eq(incidents.organizationId, organizationId), or(eq(incidents.status, "open"), eq(incidents.status, "acknowledged")))).returning();
  if (!updated) {
    const [existing] = await database.select({ id: incidents.id, status: incidents.status }).from(incidents)
      .where(and(eq(incidents.id, context.req.param("incidentId")), eq(incidents.projectId, context.req.param("projectId")), eq(incidents.organizationId, organizationId))).limit(1);
    if (!existing) return context.json({ error: { code: "NOT_FOUND", message: "Incident not found in this project." } }, 404);
    return context.json({ data: existing });
  }
  return context.json({ data: updated });
}));

app.get("/api/v1/projects/:projectId/uptime-monitors", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const data = await database.select().from(uptimeMonitors)
    .where(and(eq(uptimeMonitors.organizationId, organizationId), eq(uptimeMonitors.projectId, projectId)))
    .orderBy(desc(uptimeMonitors.createdAt));
  return context.json({ data, checksEnabled: Boolean(context.env.UPTIME_PROBES) });
}));

app.post("/api/v1/projects/:projectId/uptime-monitors", async (context) => withOrganization(context, async (database, organizationId, role, userId) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot manage uptime monitors." } }, 403);
  const projectId = context.req.param("projectId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const parsed = createUptimeMonitorSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "VALIDATION_ERROR", message: "The uptime monitor details are invalid.", details: parsed.error.flatten() } }, 400);
  const [created] = await database.insert(uptimeMonitors).values({
    id: crypto.randomUUID(),
    organizationId,
    projectId,
    name: parsed.data.name,
    url: parsed.data.url,
    method: parsed.data.method,
    intervalSeconds: parsed.data.intervalSeconds,
    timeoutMs: parsed.data.timeoutMs,
    expectedStatusCode: parsed.data.expectedStatusCode,
    enabled: parsed.data.enabled,
    createdBy: userId,
  }).returning();
  return context.json({ data: created, checksEnabled: Boolean(context.env.UPTIME_PROBES) }, 201);
}));

app.patch("/api/v1/projects/:projectId/uptime-monitors/:monitorId", async (context) => withOrganization(context, async (database, organizationId, role) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot manage uptime monitors." } }, 403);
  const projectId = context.req.param("projectId");
  const monitorId = context.req.param("monitorId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const parsed = updateUptimeMonitorSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: "VALIDATION_ERROR", message: "Provide valid uptime monitor fields.", details: parsed.error.flatten() } }, 400);
  const [updated] = await database.update(uptimeMonitors).set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(uptimeMonitors.id, monitorId), eq(uptimeMonitors.projectId, projectId), eq(uptimeMonitors.organizationId, organizationId)))
    .returning();
  if (!updated) return context.json({ error: { code: "NOT_FOUND", message: "Uptime monitor not found in this project." } }, 404);
  return context.json({ data: updated, checksEnabled: Boolean(context.env.UPTIME_PROBES) });
}));

app.delete("/api/v1/projects/:projectId/uptime-monitors/:monitorId", async (context) => withOrganization(context, async (database, organizationId, role) => {
  if (!canManageOrganizationResources(role)) return context.json({ error: { code: "FORBIDDEN", message: "Your organization role cannot manage uptime monitors." } }, 403);
  const projectId = context.req.param("projectId");
  const monitorId = context.req.param("monitorId");
  const [deleted] = await database.delete(uptimeMonitors)
    .where(and(eq(uptimeMonitors.id, monitorId), eq(uptimeMonitors.projectId, projectId), eq(uptimeMonitors.organizationId, organizationId)))
    .returning({ id: uptimeMonitors.id });
  if (!deleted) return context.json({ error: { code: "NOT_FOUND", message: "Uptime monitor not found in this project." } }, 404);
  return context.json({ data: { deleted: true } });
}));

app.get("/api/v1/projects/:projectId/uptime-monitors/:monitorId/checks", async (context) => withOrganization(context, async (database, organizationId) => {
  const projectId = context.req.param("projectId");
  const monitorId = context.req.param("monitorId");
  const [project] = await database.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) return context.json({ error: { code: "NOT_FOUND", message: "Project not found in this organization." } }, 404);
  const [monitor] = await database.select({ id: uptimeMonitors.id }).from(uptimeMonitors)
    .where(and(eq(uptimeMonitors.id, monitorId), eq(uptimeMonitors.projectId, projectId), eq(uptimeMonitors.organizationId, organizationId))).limit(1);
  if (!monitor) return context.json({ error: { code: "NOT_FOUND", message: "Uptime monitor not found in this project." } }, 404);
  const limit = parseQueryLimit(context.req.query("limit"));
  if (limit === null) return context.json({ error: { code: "INVALID_LIMIT", message: "Limit must be an integer between 1 and 100." } }, 400);
  const data = await database.select().from(uptimeCheckResults)
    .where(and(eq(uptimeCheckResults.monitorId, monitorId), eq(uptimeCheckResults.projectId, projectId), eq(uptimeCheckResults.organizationId, organizationId)))
    .orderBy(desc(uptimeCheckResults.checkedAt)).limit(limit);
  return context.json({ data, checksEnabled: Boolean(context.env.UPTIME_PROBES) });
}));


app.post("/internal/uptime-results", async (context) => {
  const secret = context.env.UPTIME_RESULTS_SECRET;
  const supplied = context.req.header("x-jerico-uptime-secret") ?? "";
  if (!secret || secret.length < 32) return context.json({ error: { code: "UPTIME_RESULTS_UNAVAILABLE", message: "Internal uptime result ingestion is not configured." } }, 503);
  if (!constantTimeEqual(secret, supplied)) return context.json({ error: { code: "UNAUTHORIZED", message: "Invalid internal credential." } }, 401);
  let body: unknown;
  try {
    body = await readBoundedJson(context.req.raw, 4096);
  } catch (error) {
    const tooLarge = error instanceof RangeError;
    return context.json({ error: { code: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", message: tooLarge ? "The probe result payload is too large." : "The probe result payload is invalid." } }, tooLarge ? 413 : 400);
  }
  const parsed = uptimeProbeResultSchema.safeParse(body);
  if (!parsed.success) return context.json({ error: { code: "VALIDATION_ERROR", message: "The uptime probe result is invalid." } }, 400);
  try {
    const result = parsed.data;
    const accepted = await withDatabase(context.env, async (database) => database.transaction(async (transaction) => {
      const [monitor] = await transaction.select({ id: uptimeMonitors.id, enabled: uptimeMonitors.enabled })
        .from(uptimeMonitors)
        .where(and(
          eq(uptimeMonitors.id, result.monitorId),
          eq(uptimeMonitors.organizationId, result.organizationId),
          eq(uptimeMonitors.projectId, result.projectId),
        )).limit(1);
      if (!monitor) return { accepted: false, reason: "monitor_not_found" as const };
      const [inserted] = await transaction.insert(uptimeCheckResults).values({
        id: result.checkId,
        organizationId: result.organizationId,
        projectId: result.projectId,
        monitorId: result.monitorId,
        status: result.status,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        errorCode: result.errorCode,
        checkedAt: new Date(result.checkedAt),
      }).onConflictDoNothing().returning({ id: uptimeCheckResults.id });
      if (!inserted) return { accepted: true, duplicate: true };
      if (monitor.enabled) {
        const checkedAt = new Date(result.checkedAt);
        await transaction.update(uptimeMonitors).set({
          lastCheckedAt: checkedAt,
          lastStatus: result.status,
          updatedAt: new Date(),
        }).where(and(
          eq(uptimeMonitors.id, result.monitorId),
          eq(uptimeMonitors.organizationId, result.organizationId),
          eq(uptimeMonitors.projectId, result.projectId),
          eq(uptimeMonitors.enabled, true),
          or(isNull(uptimeMonitors.lastCheckedAt), lte(uptimeMonitors.lastCheckedAt, checkedAt)),
        ));
      }
      return { accepted: true, duplicate: false };
    }));
    return context.json({ data: accepted }, 202);
  } catch (error) {
    console.error("Jerico uptime result persistence failed", {
      checkId: parsed.data.checkId,
      monitorId: parsed.data.monitorId,
      error: error instanceof Error ? error.message : String(error),
    });
    return context.json({ error: { code: "UPTIME_RESULT_FAILED", message: "The probe result could not be stored." } }, 502);
  }
});

app.onError((error, context) => {
  console.error("Jerico API request failed", { requestId: context.get("requestId"), error });
  return context.json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed.", requestId: context.get("requestId") } }, 500);
});

export { app };

export default {
  fetch: app.fetch.bind(app),
  scheduled(controller: ScheduledController, env: AppEnvironment["Bindings"], context: ExecutionContext) {
    context.waitUntil(evaluateAlertRules(env).catch((error) => {
      console.error("Jerico alert evaluation failed", error instanceof Error ? error.message : String(error));
    }));
    context.waitUntil(scheduleDueUptimeMonitors(env).catch((error) => {
      console.error("Jerico uptime scheduling failed", error instanceof Error ? error.message : String(error));
    }));
    if (controller.cron === "0 3 * * *") {
      context.waitUntil(pruneUptimeCheckHistory(env).catch((error) => {
        console.error("Jerico uptime history retention failed", error instanceof Error ? error.message : String(error));
      }));
    }
  },
};
