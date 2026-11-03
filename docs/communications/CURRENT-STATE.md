# Jerico — Current Project Handover

**Last updated:** 2026-11-03  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Current work branch:** `feat/phase-2-ingestion-credentials`  
**Current PR:** https://github.com/richard-mante/jerico/pull/3 (draft)  
**Current milestone:** Phase 2A credentials + Phase 2B telemetry ingestion; validation pending

> Read this file first, then the decision log, session log, architecture, and roadmap. Always inspect actual code before relying on this handover.

## Product direction

Jerico is an extensible open-source Founder Operating System. The first independently useful product is Jerico Observability. It must support managed cloud and self-hosted deployments, monitor Jerico itself, and let external developers instrument their own applications. TypeScript browser and Node SDKs are the initial developer experience.

## Confirmed architecture

- pnpm + Turborepo monorepo.
- Next.js + React + TypeScript web dashboard.
- Tauri 2 + Vite + React + TypeScript desktop client.
- Hono APIs designed for Cloudflare Workers and future self-hosted runtime adapters.
- PostgreSQL + Drizzle for transactional/configuration data.
- Cloudflare Hyperdrive for managed Worker-to-PostgreSQL connectivity.
- ClickHouse for telemetry analytics.
- Better Auth self-hosted inside the Hono API Worker; no separate authentication hosting subscription.
- Cloudflare Queues for managed telemetry buffering; a self-hosted durable queue adapter is still required.
- Cloudflare-specific services must remain behind narrow adapters so self-hosted deployments remain viable.

## Phase 0 and Phase 1 status

- Phase 0 foundation merged to `main`.
- Phase 1 identity and tenancy PR #2 merged to `main` as `5952c67ead9868783a7d764d06ca78bf3d4fa37b`.
- Phase 1 code includes Better Auth email/password authentication, PostgreSQL/Drizzle schema and migration, organization/membership/invitation support, organization-scoped product/project/environment APIs, basic web onboarding, and invitation acceptance.
- Better Auth is a self-hosted open-source library running inside the Hono API Worker. It is not a separate hosted service.
- Hyperdrive-aware request-scoped `pg.Client` lifecycle is implemented. A real Hyperdrive resource/binding has not been provisioned.

**Verification remains incomplete:** no generated pnpm lockfile; install, lint, typecheck, tests, and builds have not been successfully run. PostgreSQL migrations have not been applied to a real/disposable database. GitHub Actions jobs have repeatedly failed before runner allocation (`runner_id: 0`, no steps/logs); pinning Ubuntu 24.04 did not resolve it. Do not treat this as evidence that code checks pass or fail.

## Phase 2A — Project ingestion credentials

Draft PR #3: https://github.com/richard-mante/jerico/pull/3

Implemented on the branch:
- `project_ingestion_keys` Drizzle schema and SQL migration.
- Credentials are bound to organization, project, and environment with composite foreign-key constraints.
- Public (`jk_pub_`) and secret (`jk_sec_`) credentials use 256-bit Web Crypto randomness.
- Store only SHA-256 hashes and a short display prefix; return raw credential once at creation.
- Authenticated project key list/create/revoke endpoints. Owners/admins create and revoke; members view metadata.
- Shared Zod request contract and tests.
- Web credential management page at `/dashboard/projects/[projectId]/keys`, linked from project cards.

## Phase 2B — Authenticated telemetry ingestion

Implemented on the same draft branch:
- Added bounded Zod telemetry contracts for events, errors, logs, metrics, and spans.
- Added `POST /ingest/v1/events` with bearer credential parsing and SHA-256 lookup.
- Rejects unknown and revoked keys. Public keys can submit only events/errors; secret keys can submit all current telemetry types.
- Tenant, project, and environment IDs are taken from the credential record, not client payloads.
- Request body capped at 96 KiB; batches capped at 100 events.
- Redacts sensitive attribute names, email addresses, bearer tokens, and JWT-like strings before enqueueing.
- Optional per-credential Cloudflare Rate Limiting binding; production mode returns 503 when configured with `APP_ENV=production` but the binding is missing.
- Atomic per-credential daily event quota in PostgreSQL, default 100,000 events per UTC day, configurable through `INGEST_DAILY_EVENT_LIMIT`; failed queue sends refund the reservation.
- Enqueues trusted, versioned envelopes to Cloudflare Queue `jerico-telemetry`.
- Adds queue consumer in `apps/worker`, ClickHouse HTTP `JSONEachRow` writer, retry behavior, and dead-letter queue config.
- Adds initial ClickHouse schema with 7-day log and 30-day other telemetry retention.
- Adds unit tests for credential parsing, redaction, ClickHouse row mapping, and write behavior.
- Adds Phase 2B documentation.

### Phase 2B limitations / provisioning

- Cloudflare Queue resources must be created and bound.
- A real Hyperdrive ID must be added to the ingest Worker config.
- Cloudflare Rate Limiting binding must be provisioned and named `INGEST_RATE_LIMITER`; production requests fail closed without it when `APP_ENV=production`.
- ClickHouse must be provisioned and its SQL schema applied; Worker URL/token secrets must be configured.
- Queue delivery is at-least-once. Duplicate writes are possible if a worker crashes after a successful ClickHouse insert but before acknowledgement. Event IDs/idempotency are follow-up work.
- Monthly plan tiers/billing metering, adaptive backpressure, self-hosted runtime/queue adapter, dashboard query APIs, and SDKs are not implemented.
- The current Worker runtime is Cloudflare-specific. Do not claim self-hosted ingestion is supported yet.

## Validation blockers

- PR #3 is draft and not production-ready.
- No dependency install or pnpm lockfile.
- No lint/typecheck/unit test/build run for Phase 1, Phase 2A, or Phase 2B.
- No PostgreSQL migration execution or API integration tests.
- No queue provisioning, Hyperdrive binding, Rate Limiting binding, or ClickHouse deployment/write verification.
- GitHub Actions hosted runner allocation issue remains unresolved.
- Do not merge until validation and database/queue/ClickHouse integration tests pass.

## Next actions

1. Review Phase 2B code and fix type/runtime issues found by actual dependency install and tests.
2. Establish a working validation environment; generate pnpm lockfile and run lint/typecheck/tests/build.
3. Apply PostgreSQL migrations to disposable PostgreSQL and test credential/tenant isolation.
4. Provision Cloudflare queues, Hyperdrive, rate limiting, and ClickHouse; test end-to-end ingestion and DLQ behavior.
5. Add idempotent event IDs and daily plan quotas.
6. Extract a queue interface and implement the self-hosted durable queue/runtime adapter before claiming self-host support.
7. Build TypeScript browser and Node SDKs after the ingestion contract stabilizes.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry here.
