# Self-hosted telemetry queue infrastructure

This Compose file is an initial self-hosted API, ingestion, and observability-worker deployment. The dashboard and production operations are still separate release work.

## Included services

- PostgreSQL 17: application database and durable queue storage.
- ClickHouse 25.8: telemetry analytics store, initialized with the repository SQL scripts.
- One-shot migration service: applies the repository Drizzle migrations.
- Node.js management API: runs the existing Hono API and Better Auth routes, publishes uptime and notification jobs to PostgreSQL, and runs alert evaluation, uptime scheduling, notification enqueue reconciliation, and daily retention tasks.
- Node.js ingestion API: reuses the managed Hono ingestion routes, but publishes telemetry directly to the PostgreSQL queue. Its per-credential rate limiter is backed by atomic PostgreSQL fixed-window counters.
- Node.js queue worker: consumes telemetry, uptime, and notification queues. Public outbound targets are DNS-resolved, checked for non-public IPs, and pinned to the validated address for the connection. Webhook redirects are rejected and uptime redirects are revalidated one hop at a time.

The API, ingestion service, and queue worker bind to container networking internally and publish only to host loopback by default. The queue worker includes health/readiness endpoints and token-protected dead-letter inspection/replay across all three queues. Internal worker callbacks use a shared secret and an explicitly enabled HTTP exception restricted to the private Compose service name `api` and port 8787; this exception must not be enabled outside this private network.

## Start

1. Copy `infrastructure/self-hosted/.env.example` to the repository root as `.env`.
2. Replace every example secret with a unique, long, URL-safe random value. Keep `.env` private and out of version control.
3. Start the stack:

```sh
docker compose -f compose.self-hosted.yaml up --build -d
```

4. Check the API at `http://127.0.0.1:8787/health`, ingestion at `http://127.0.0.1:8788/health`, and worker readiness at `http://127.0.0.1:8789/ready`.
5. Send SDK telemetry to `http://127.0.0.1:8788/ingest/v1/events` (use HTTPS behind a trusted reverse proxy for non-local access).
6. Use `Authorization: Bearer $QUEUE_ADMIN_TOKEN` for the worker's private `/dead-letters` endpoints. Add `?queue=jerico-uptime-probes` or `?queue=jerico-notifications` to inspect those queues.

Stop services without deleting data:

```sh
docker compose -f compose.self-hosted.yaml down
```

To intentionally delete the PostgreSQL and ClickHouse volumes, use `docker compose -f compose.self-hosted.yaml down -v`.

## Current boundary

- The managed Cloudflare API/ingest/worker deployment remains unchanged. The Compose Node API and ingestion service publish to PostgreSQL; their worker callbacks remain on the private Compose network.
- The dashboard/web frontend, automated backups, restore workflow, external TLS/reverse-proxy configuration, and production operational hardening are not included yet.
- Do not expose the API, ingestion, or queue-worker ports directly to the public internet. Put the API/ingest behind a trusted HTTPS reverse proxy. Dead-letter payload inspection can reveal customer telemetry.
- Docker build, Compose validation, migrations, and live PostgreSQL/ClickHouse checks have not yet been run.

See [ADR 0001](../architecture/0001-provider-neutral-durable-queue.md) and [issue #107](https://github.com/richard-mante/jerico/issues/107) for the broader design and remaining work.
