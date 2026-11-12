# Jerico self-hosted API

This Node.js service runs the existing Hono API, Better Auth, and observability management routes outside Cloudflare Workers. Uptime and notification publishers use the PostgreSQL durable queues shared with the Node queue worker.

## Requirements

- Node.js 22.12 or newer
- PostgreSQL with all repository migrations applied
- ClickHouse with the telemetry schema initialized
- A public HTTPS origin configured for Better Auth and the web application

## Required configuration

- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET` (at least 32 random characters)
- `WEB_APP_URL`
- `CLICKHOUSE_URL`
- `UPTIME_RESULTS_SECRET` (at least 32 random characters)
- `NOTIFICATION_DELIVERY_SECRET` (at least 32 random characters)
- `WEBHOOK_ENCRYPTION_KEY` (base64url-encoded 32-byte key)

Optional: `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_TOKEN`, `HOST`, `PORT`, `DATABASE_POOL_MAX`, and `QUEUE_MAX_ATTEMPTS`.

The service runs alert evaluation, uptime scheduling, notification enqueue reconciliation every minute, and uptime-history retention once daily after 03:00 UTC. It uses the same route handlers, authentication, organization authorization, and PostgreSQL schema as the managed Hono API.

## Run

```sh
pnpm --filter @jerico/database db:migrate
pnpm --filter @jerico/api-node start
```

Keep the API behind a trusted HTTPS reverse proxy. Internal worker callbacks use shared secrets and should remain on a private network.
