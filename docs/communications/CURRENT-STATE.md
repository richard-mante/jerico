# Jerico — Current Project Handover

**Last updated:** 2026-11-03  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Current work branch:** `chore/phase-2c-validation-handover`  
**Current milestone:** Phase 2C — validation and infrastructure readiness

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

## Phase 2C — Validation and infrastructure readiness (current)

**No automated checks are currently confirmed passing.** The repository has no committed `pnpm-lock.yaml`; dependency installation, lint, typecheck, tests, builds, and PostgreSQL integration tests remain outstanding.

The latest main-branch CI run after PR #3 merged is run #73 (ID `41559078138`). It failed within seconds. The job endpoint returned no runner assignment, no steps, and no logs (`steps: null`). Earlier runs show the same pattern. This is consistent with a hosted-runner allocation/startup failure, but the precise platform-side cause is unknown. It is not evidence that source checks passed or failed.

Database migrations have not been applied to a disposable or production PostgreSQL instance. Cloudflare Hyperdrive, Queue, Rate Limiting bindings, and ClickHouse have not been provisioned or exercised end-to-end. No production deployment has been verified.

### Remaining validation work

1. Establish a working local or CI environment and generate/commit `pnpm-lock.yaml`.
2. Run workspace install, lint, typecheck, unit tests, and builds; fix all resulting errors.
3. Review Drizzle schema/migration consistency and generate the required initial migration snapshot.
4. Apply migrations to disposable PostgreSQL; add integration coverage for Better Auth, tenant isolation, credential permissions/revocation, and atomic quotas.
5. Provision Hyperdrive, Cloudflare Queues, Rate Limiting, and ClickHouse; verify ingestion, retries, and DLQ.
6. Add event idempotency/deduplication before relying on at-least-once queue delivery for production analytics.

### Known product gaps

- Dashboard telemetry query APIs and observability views are not implemented.
- TypeScript browser and Node SDKs are not implemented.
- Alerts, notification channels, and full uptime monitoring are not implemented.
- Monthly plan tiers, billing metering, adaptive backpressure, and configurable retention are not implemented.
- A self-hosted durable queue/runtime adapter and Docker Compose deployment are not implemented. The current ingestion runtime is Cloudflare-specific; do not claim self-hosted ingestion support yet.

## Next milestones after Phase 2C

1. Stabilize the ingestion pipeline and its contracts.
2. Build the TypeScript browser and Node SDKs with integration examples.
3. Build dashboard query APIs and the Observability UI (events/errors/logs/metrics/traces).
4. Add uptime checks, alert rules, and notification channels.
5. Add usage metering/billing and production operational safeguards.
6. Implement self-hosted runtime/queue adapters and Docker Compose deployment.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry here.
