# Self-hosted telemetry queue infrastructure

This Compose file runs the initial self-hosted web dashboard, management API, ingestion API, and observability workers. Production operations are still separate release work.

## Included services

- Next.js web dashboard: standalone production container, with its public API origin embedded at build time.
- PostgreSQL 17: application database and durable queue storage.
- ClickHouse 25.8: telemetry analytics store, initialized with the repository SQL scripts.
- One-shot migration service: applies the repository Drizzle migrations.
- Node.js management API: runs the existing Hono API and Better Auth routes, publishes uptime and notification jobs to PostgreSQL, and runs alert evaluation, uptime scheduling, notification enqueue reconciliation, and daily retention tasks.
- Node.js ingestion API: reuses the managed Hono ingestion routes, but publishes telemetry directly to the PostgreSQL queue. Its per-credential rate limiter is backed by atomic PostgreSQL fixed-window counters.
- Node.js queue worker: consumes telemetry, uptime, and notification queues. Public outbound targets are DNS-resolved, checked for non-public IPs, and pinned to the validated address for the connection. Webhook redirects are rejected and uptime redirects are revalidated one hop at a time.

The web dashboard, API, ingestion service, and queue worker bind to container networking internally and publish only to host loopback by default. Caddy is the only public-facing service and terminates HTTPS for the three configured domains. The queue worker includes health/readiness endpoints and token-protected dead-letter inspection/replay across all three queues. Internal worker callbacks use a shared secret and an explicitly enabled HTTP exception restricted to the private Compose service name `api` and port 8787; this exception must not be enabled outside this private network.

## Start

1. Create DNS A records for `APP_DOMAIN`, `API_DOMAIN`, and `INGEST_DOMAIN` pointing to the server. Configure AAAA records only if IPv6 is correctly routed to the server.
2. Copy `infrastructure/self-hosted/.env.example` to the repository root as `.env`.
3. Set the three domains, a valid `ACME_EMAIL`, and replace every example secret with a unique, long, URL-safe random value. Keep `.env` private and out of version control.
4. Open inbound TCP ports 80 and 443 (plus UDP 443 for HTTP/3) in the firewall, then start the stack:

```sh
docker compose -f compose.self-hosted.yaml up --build -d
```

5. Open the dashboard at `https://APP_DOMAIN`, check `https://API_DOMAIN/health` and `https://INGEST_DOMAIN/health`, and verify worker readiness locally at `http://127.0.0.1:8789/ready`.
6. Send SDK telemetry to `https://INGEST_DOMAIN/ingest/v1/events`.
7. Use `Authorization: Bearer $QUEUE_ADMIN_TOKEN` against the loopback-only worker `/dead-letters` endpoints. Add `?queue=jerico-uptime-probes` or `?queue=jerico-notifications` to inspect those queues.

Stop services without deleting data:

```sh
docker compose -f compose.self-hosted.yaml down
```

To intentionally delete the PostgreSQL and ClickHouse volumes, use `docker compose -f compose.self-hosted.yaml down -v`.

## Backup and restore

- Create a consistent PostgreSQL + ClickHouse backup with `bash scripts/self-hosted/backup.sh`.
- Restore a selected backup with `CONFIRM_DESTRUCTIVE_RESTORE=YES bash scripts/self-hosted/restore.sh YYYYMMDDTHHMMSSZ`.
- Read the [backup and restore guide](./backup-restore.md) before running either script. Backups contain sensitive customer data and must be encrypted before off-site transfer.

## Current boundary

- The managed Cloudflare API/ingest/worker deployment remains unchanged. The Compose Node API and ingestion service publish to PostgreSQL; their worker callbacks remain on the private Compose network.
- Automated backups, restore workflow, external TLS/reverse-proxy configuration, and production operational hardening are not included yet.
- Do not expose the dashboard, API, ingestion, or queue-worker ports directly to the public internet. Only Caddy's ports 80/443 should be public; queue administration stays on loopback. Dead-letter payload inspection can reveal customer telemetry.
- Docker build, Compose validation, migrations, and live PostgreSQL/ClickHouse checks have not yet been run.

See [ADR 0001](../architecture/0001-provider-neutral-durable-queue.md) and [issue #107](https://github.com/richard-mante/jerico/issues/107) for the broader design and remaining work.
