# Jerico self-hosted telemetry queue worker

This Node.js service consumes telemetry, uptime-probe, and notification envelopes from PostgreSQL-backed queues. Telemetry is written to ClickHouse; uptime and notification handlers reuse the managed worker's business logic with a Node outbound transport that validates DNS results and pins each connection to a verified public IP.

## Requirements

- Node.js 22.12 or newer
- PostgreSQL with migration `0022_durable_queue_messages.sql` applied
- ClickHouse with the Jerico telemetry table initialized

## Configuration

Required:

- `DATABASE_URL`
- `CLICKHOUSE_URL`

Optional:

- `CLICKHOUSE_DATABASE` (default `jerico`)
- `CLICKHOUSE_TABLE` (default `telemetry_events`)
- `CLICKHOUSE_USERNAME` / `CLICKHOUSE_PASSWORD`, or `CLICKHOUSE_TOKEN`
- `TELEMETRY_QUEUE_NAME` (default `jerico-telemetry`)
- `QUEUE_MAX_ATTEMPTS` (default `5`, range 1–100)
- `QUEUE_BATCH_SIZE` (default `20`, range 1–100)
- `QUEUE_VISIBILITY_TIMEOUT_SECONDS` (default `60`, range 1–3600)
- `QUEUE_POLL_INTERVAL_MS` (default `1000`, range 100–30000)
- `DATABASE_POOL_MAX` (default `8`, range 1–50)
- `HOST` (default `127.0.0.1`; set to `0.0.0.0` only inside a private container network)
- `PORT` (default `8789`)
- `QUEUE_ADMIN_TOKEN` (optional; at least 32 characters; enables authenticated dead-letter inspection and replay)
- `API_URL` (required; private Compose uses `http://api:8787`)
- `UPTIME_RESULTS_SECRET`, `NOTIFICATION_DELIVERY_SECRET`, and `WEBHOOK_ENCRYPTION_KEY` (required)
- `PROBE_WORKER_HOST` (default `api`)
- `ALLOW_INTERNAL_API_HTTP` (only set to `true` for the private Compose service `api:8787`)
- `RESEND_API_KEY` and `EMAIL_FROM` (required for email notifications)

Do not expose the health server publicly. It has no user authentication and should be reachable only by the local host or private container network.

## Run

```sh
pnpm --filter @jerico/database db:migrate
pnpm --filter @jerico/queue-worker start
```

The worker validates the queue table at startup, polls with bounded batch size, leases each message, and processes deliveries independently. Successful writes are acknowledged. Failed writes are retried with bounded exponential backoff; messages that exhaust their attempt budget move to the queryable `dead_lettered` state. Stale lease tokens cannot acknowledge or retry reclaimed work.

## Health

- `GET /health`: service and queue status
- `GET /ready`: database and queue readiness plus queue depth/age/dead-letter counters

The process handles SIGINT/SIGTERM and attempts a graceful stop. If a handler outlives the shutdown timeout, its lease expires and the message becomes eligible for recovery.

## Dead-letter administration

When `QUEUE_ADMIN_TOKEN` is configured, the private health server also exposes:

- `GET /dead-letters?limit=50`: list dead-letter metadata (limit 1–100)
- `GET /dead-letters/:id`: inspect one stored payload and its failure metadata
- `POST /dead-letters/:id/replay`: explicitly reset the message for another attempt

Send `Authorization: Bearer <QUEUE_ADMIN_TOKEN>` with each request. Payload inspection may expose customer telemetry; keep this service on localhost/private networking and protect the token as a secret. Replay is allowed only for messages still in the dead-letter state; active deduplication conflicts are rejected.

## Compose infrastructure slice

A PostgreSQL + ClickHouse + migration + telemetry-worker Compose stack is available at the repository root:

```sh
cp infrastructure/self-hosted/.env.example .env
# Replace all example secrets before starting.
docker compose -f compose.self-hosted.yaml up --build -d
```

See [the self-hosted Compose guide](../../docs/self-hosting/telemetry-queue-compose.md) for the exact scope and operational caveats.

## Current scope

This worker consumes telemetry only. The managed Cloudflare API and ingest services still publish to Cloudflare Queues; no production producer routing has switched to PostgreSQL. Uptime and notification jobs remain on the managed Cloudflare runtime. The Compose file is an infrastructure slice, not a complete self-hosted Jerico release. Docker build, Compose validation, and PostgreSQL/ClickHouse runtime checks are not yet confirmed.
