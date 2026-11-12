# Jerico self-hosted telemetry queue worker

This Node.js service consumes telemetry envelopes from the PostgreSQL-backed queue and writes them to ClickHouse. It is the first self-hosted queue consumer; uptime probes and notification delivery remain on the managed Cloudflare runtime until their outbound-network security requirements are ported and reviewed.

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

## Current scope

This worker consumes telemetry only. It does not yet consume uptime or notification jobs or switch production Cloudflare routing. Do not treat the self-hosted deployment as complete until those handlers, Docker Compose, and PostgreSQL/ClickHouse runtime validation are finished.
