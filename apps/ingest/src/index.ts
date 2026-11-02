import { Hono } from "hono";

const app = new Hono();

app.get("/health", (context) => context.json({
  status: "ok",
  service: "ingest",
  pipeline: "not-configured",
}));

app.post("/ingest/v1/*", (context) => context.json({
  error: {
    code: "INGESTION_NOT_READY",
    message: "Telemetry ingestion is not enabled until credentials, validation, and durable processing are configured.",
  },
}, 503));

export default app;
