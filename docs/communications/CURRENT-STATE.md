# Jerico — Current Project Handover

**Last updated:** 2026-11-03  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Current work branch:** `main` (no active feature branch)  
**Current milestone:** Phase 3 — TypeScript SDK foundation merged; validation and ingestion integration pending

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

## Merged implementation

### Phase 0 — Foundation

Merged to `main`; includes the monorepo/application scaffolding, shared foundations, CI workflow, architecture and continuity documentation.

### Phase 1 — Identity and tenancy

PR #2 merged to `main` as `5952c67ead9868783a7d764d06ca78bf3d4fa37b`.

Includes Better Auth email/password authentication, PostgreSQL/Drizzle schema and migration, organization/membership/invitation support, organization-scoped product/project/environment APIs, basic web onboarding, and invitation acceptance.

Better Auth is a self-hosted open-source library running inside the Hono API Worker. It is not a separate hosted service.

### Phase 2A/2B — Credentials and telemetry ingestion

PR #3 merged to `main` as `d0430e584f496057ca73dda70e6df718a290e8ea`.

Includes:
- Organization/project/environment-scoped ingestion credentials; public (`jk_pub_`) and secret (`jk_sec_`) values are generated using Web Crypto. Only hashes and short prefixes are stored.
- Authenticated credential list/create/revoke APIs and project credential UI.
- Bounded Zod contracts for events, errors, logs, metrics, and spans.
- `POST /ingest/v1/events` with credential verification, tenant scope derived from the credential record, public-vs-secret type permissions, payload/batch limits, and redaction.
- Per-project daily event quota (default 100,000 events per UTC day) with transactional reservation and refund when queue publication fails.
- Cloudflare Queue producer/consumer, ClickHouse HTTP JSONEachRow writer, retry/DLQ configuration, and initial ClickHouse retention schema.

PR #5 merged to `main` as `b6515688db8dc9e688e70b52635019848ed0967c`. It assigns server-generated event IDs before queue publication and uses ClickHouse `ReplacingMergeTree` to mitigate duplicates from queue redelivery. This is eventual deduplication during background merges, not strict immediate uniqueness. Existing ClickHouse tables require a deliberate migration/rebuild; rerunning the initial `CREATE TABLE IF NOT EXISTS` will not change an existing table engine.

### Phase 3 — TypeScript SDK foundation

PR #6 merged to `main` as `d4894534940805f08ae0bc2e0d591e3762c7cd3a`.

Includes:
- `@jerico/sdk-core`: bounded in-memory buffering, validation, batching, telemetry helpers, explicit flush/close, and error reporting.
- `@jerico/sdk-browser`: public-key enforcement, anonymous session IDs, explicit identify/reset, pathname/title page views, window errors, and unhandled promise rejection capture.
- `@jerico/sdk-node`: secret-key enforcement, telemetry methods, and opt-in unhandled rejection capture.
- Next.js and Express integration examples, package tests, and privacy/delivery documentation.

The SDK requires an explicit endpoint. Browser keys are restricted to events/errors; Node uses secret keys for all supported telemetry types. Automatic retries remain disabled because request-level idempotency is not implemented. Buffers are memory-only and packages remain private pending validation/build/release strategy.

## Validation and infrastructure readiness — outstanding

**No automated checks are currently confirmed passing.** The repository has no committed `pnpm-lock.yaml`; dependency installation, lint, typecheck, tests, builds, and PostgreSQL integration tests remain outstanding.

The GitHub Actions workflow has repeatedly failed before hosted runner assignment: job payloads reported `runner_id: 0`, no runner name, no steps, and no logs. This is consistent with a runner allocation/startup problem, but the precise platform-side cause is unknown. It is not evidence that source checks passed or failed.

No migrations have been applied to a disposable or production PostgreSQL instance. Cloudflare Hyperdrive, Queue, Rate Limiting bindings, and ClickHouse have not been provisioned or exercised end-to-end. No production deployment has been verified.

### Remaining validation work

1. Establish a working local or CI environment and generate/commit `pnpm-lock.yaml`.
2. Run workspace install, lint, typecheck, unit tests, and builds; fix all resulting errors.
3. Review Drizzle schema/migration consistency and generate the required initial migration snapshot.
4. Apply migrations to disposable PostgreSQL; add integration coverage for Better Auth, tenant isolation, credential permissions/revocation, and atomic quotas.
5. Provision Hyperdrive, Cloudflare Queues, Rate Limiting, and ClickHouse; verify ingestion, retries, and DLQ.
6. Validate event-level deduplication and query semantics against a real ClickHouse instance.
7. Validate SDK packages and run the documented examples against a local deployment.

### Known product gaps

- Dashboard telemetry query APIs and observability views are not implemented.
- SDK foundations are merged but not validated or production-ready.
- Request-level idempotency is missing; client retries after ambiguous HTTP responses may create duplicate accepted batches.
- Browser route-change instrumentation and Core Web Vitals are not implemented.
- OpenTelemetry integrations, SDK package build/release workflow, and public package publishing are not implemented.
- Alerts, notification channels, and full uptime monitoring are not implemented.
- Monthly plan tiers, billing metering, adaptive backpressure, and configurable retention are not implemented.
- A self-hosted durable queue/runtime adapter and Docker Compose deployment are not implemented. The current ingestion runtime is Cloudflare-specific; do not claim self-hosted ingestion support yet.

## Next milestones

1. Complete Phase 2C/3 validation and infrastructure integration.
2. Add request-level ingestion idempotency and integration tests.
3. Finish browser/Node SDK capabilities and package build/release strategy.
4. Build tenant-safe dashboard query APIs and Observability UI (events/errors/logs/metrics/traces).
5. Add uptime checks, alert rules, and notification channels.
6. Add usage metering/billing and production operational safeguards.
7. Implement self-hosted runtime/queue adapters and Docker Compose deployment.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry here.
