# Self-hosted telemetry queue infrastructure

This Compose file is an initial self-hosted telemetry ingestion and processing slice. It is not a complete self-hosted Jerico release.

## Included services

- PostgreSQL 17: application database and durable queue storage.
- ClickHouse 25.8: telemetry analytics store, initialized with the repository SQL scripts.
- One-shot migration service: applies the repository Drizzle migrations.
- Node.js ingestion API: reuses the managed Hono ingestion routes, but publishes telemetry directly to the PostgreSQL queue. Its per-credential rate limiter is backed by atomic PostgreSQL fixed-window counters.
- Node.js queue worker: consumes `jerico-telemetry` from PostgreSQL and writes validated envelopes to ClickHouse.

The ingestion API and queue worker both bind to container networking internally and publish only to host loopback by default. The queue worker includes health/readiness endpoints and token-protected dead-letter inspection/replay.

## Start

1. Copy `infrastructure/self-hosted/.env.example` to the repository root as `.env`.
2. Replace every example secret with a unique, long, URL-safe random value. Keep `.env` private and out of version control.
3. Start the stack:

```sh
docker compose -f compose.self-hosted.yaml up --build -d
```

4. Check ingestion at `http://127.0.0.1:8788/health` and worker readiness at `http://127.0.0.1:8789/ready`.
5. Send SDK telemetry to `http://127.0.0.1:8788/ingest/v1/events` (use HTTPS behind a trusted reverse proxy for non-local access).
6. Use `Authorization: Bearer $QUEUE_ADMIN_TOKEN` for the worker's private `/dead-letters` endpoints.

Stop services without deleting data:

```sh
docker compose -f compose.self-hosted.yaml down
```

To intentionally delete the PostgreSQL and ClickHouse volumes, use `docker compose -f compose.self-hosted.yaml down -v`.

## Current boundary

- The managed Cloudflare API/ingest deployment remains unchanged and continues to publish to Cloudflare Queues. The Compose-only Node ingestion service reuses the same Hono routes and publishes to PostgreSQL.
- This Compose slice includes telemetry ingestion and consumption only; it does not yet include the dashboard, authentication/API management runtime, uptime/notification consumers, backups, restore, or a full operational deployment.
- Do not expose the queue worker port publicly. Dead-letter payload inspection can reveal customer telemetry.
- Docker build, Compose validation, migrations, and live PostgreSQL/ClickHouse checks have not yet been run.

See [ADR 0001](../architecture/0001-provider-neutral-durable-queue.md) and [issue #107](https://github.com/richard-mante/jerico/issues/107) for the broader design and remaining work.
