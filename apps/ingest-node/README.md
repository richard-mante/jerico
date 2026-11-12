# Jerico self-hosted ingestion API

This Node.js HTTP service reuses the existing Hono ingestion application and routes accepted telemetry into the PostgreSQL-backed durable queue.

## Requirements

- Node.js 22.12 or newer
- PostgreSQL with migrations 0022 and 0023 applied
- The standalone telemetry queue worker running against the same database and queue name

## Configuration

Required: `DATABASE_URL`.

Optional:

- `HOST` (default `127.0.0.1`; set `0.0.0.0` only in a private container network)
- `PORT` (default `8788`)
- `TELEMETRY_QUEUE_NAME` (default `jerico-telemetry`)
- `QUEUE_MAX_ATTEMPTS` (default `5`)
- `DATABASE_POOL_MAX` (default `12`)
- `INGEST_RATE_LIMIT_REQUESTS` (default `120`)
- `INGEST_RATE_LIMIT_WINDOW_SECONDS` (default `60`)
- `INGEST_DAILY_EVENT_LIMIT` (default `100000`)

The rate limiter uses an atomic PostgreSQL fixed window per credential. This replaces the Cloudflare rate-limit binding for this Node runtime. The existing ingestion credential validation, public-key restrictions, redaction, daily quota accounting, idempotency outbox, and event timestamp validation are reused unchanged.

The service runs pending idempotency-outbox recovery at startup and every 15 minutes, matching the managed worker's reconciliation cadence.

## Run

```sh
pnpm --filter @jerico/database db:migrate
pnpm --filter @jerico/ingest-node start
```

`GET /health` checks PostgreSQL and queue health; `GET /ready` also returns queue depth/age/dead-letter counters. Keep the service behind a trusted reverse proxy and apply HTTPS at the edge.
