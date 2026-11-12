# Self-hosted telemetry queue worker

This is an early self-hosted runtime slice, not a complete self-hosted Jerico deployment.

## What this stack runs

- PostgreSQL 17 for durable queue messages and application database migrations.
- ClickHouse 25.8 with the repository telemetry table initialization scripts.
- A Node.js telemetry queue consumer using the shared `@jerico/queue` contracts and PostgreSQL queue adapter.
- HTTP liveness/readiness endpoint on port 8789.

The worker consumes messages from the PostgreSQL queue named `jerico-telemetry`, validates the telemetry envelope, writes valid events to ClickHouse, acknowledges successful writes, and retries handler failures with bounded exponential backoff. The queue adapter enforces lease-token fencing, retry limits, active-message deduplication, and terminal-message retention/pruning primitives.

## Start the infrastructure slice

1. Copy `infrastructure/self-hosted/.env.example` to the repository-root `.env`.
2. Replace both example passwords with long random secrets.
3. Run:

```sh
docker compose -f compose.self-hosted.yaml up --build -d
```

4. Check the worker at `http://localhost:8789/health` and `http://localhost:8789/ready`.

To stop the services, run `docker compose -f compose.self-hosted.yaml down`. Persistent database volumes are retained. Use `docker compose -f compose.self-hosted.yaml down -v` only when intentionally deleting the local PostgreSQL and ClickHouse data.

## Current limitations

- The managed Cloudflare API and ingestion services still publish to Cloudflare Queues. They do not yet publish to this PostgreSQL queue.
- This stack does not yet provide a self-hosted HTTP API/dashboard, authentication runtime, uptime/notification consumers, queue dead-letter inspection/replay interface, backup/restore workflow, or production hardening.
- The queue worker only consumes telemetry messages. Do not expose it as a public application API.
- Invalid telemetry envelopes are acknowledged and discarded, matching the existing managed worker policy; a redacted quarantine/replay workflow remains outstanding.
- No end-to-end runtime, Docker build, migration, typecheck, lint, or test validation is claimed for this initial slice.

The provider-neutral queue architecture is recorded in [ADR 0001](../architecture/0001-provider-neutral-durable-queue.md), and the remaining implementation is tracked in [issue #107](https://github.com/richard-mante/jerico/issues/107).
