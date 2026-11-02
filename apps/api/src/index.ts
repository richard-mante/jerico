import { Hono } from "hono";

type Bindings = { APP_ENV?: string };
const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (context) => context.json({
  name: "Jerico API",
  version: "v1",
  status: "foundation",
  documentation: "https://github.com/richard-mante/jerico",
}));

app.get("/health", (context) => context.json({
  status: "ok",
  service: "api",
  environment: context.env.APP_ENV ?? "development",
  checks: { database: "not-configured", authentication: "not-configured" },
}));

app.all("/api/v1/*", (context) => context.json({
  error: { code: "NOT_IMPLEMENTED", message: "The management API is being implemented." },
}, 501));

export default app;
