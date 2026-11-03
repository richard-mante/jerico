# Jerico — Current Project Handover

**Last updated:** 2026-11-03  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Current work branch:** `feat/phase-3-typescript-sdk-foundation`  
**Current milestone:** Phase 3 — TypeScript SDK foundation (validation pending); Phase 2C infrastructure validation remains outstanding

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

## Phase 2C — Validation and infrastructure readiness (ongoing)

**No automated checks are currently confirmed passing.** The repository has no committed `pnpm-lock.yaml`; dependency installation, lint, typecheck, tests, builds, and PostgreSQL integration tests remain outstanding.

The latest main-branch CI run before this SDK branch was run #73 (ID `41559078138`). The Phase 2C PR #5 CI run #78 (ID `41560761906`) also failed before runner assignment, with no steps or logs. Earlier runs show the same pattern. This is consistent with a hosted-runner allocation/startup failure, but the precise platform-side cause is unknown. It is not evidence that source checks passed or failed.

Database migrations have not been applied to a disposable or production PostgreSQL instance. Cloudflare Hyperdrive, Queue, Rate Limiting bindings, and ClickHouse have not been provisioned or exercised end-to-end. No production deployment has been verified.

### Remaining validation work

1. Establish a working local or CI environment and generate/commit `pnpm-lock.yaml`.
2. Run workspace install, lint, typecheck, unit tests, and builds; fix all resulting errors.
3. Review Drizzle schema/migration consistency and generate the required initial migration snapshot.
4. Apply migrations to disposable PostgreSQL; add integration coverage for Better Auth, tenant isolation, credential permissions/revocation, and atomic quotas.
5. Provision Hyperdrive, Cloudflare Queues, Rate Limiting, and ClickHouse; verify ingestion, retries, and DLQ.
6. Validate event-level deduplication: IDs are assigned before queue publication and ClickHouse uses `ReplacingMergeTree`; query semantics and client retry behavior still need integration tests.

### Known product gaps

- Dashboard telemetry query APIs and observability views are not implemented.
- SDK foundation is in an unmerged Phase 3 branch; it is not validated or production-ready.
- Alerts, notification channels, and full uptime monitoring are not implemented.
- Monthly plan tiers, billing metering, adaptive backpressure, and configurable retention are not implemented.
- A self-hosted durable queue/runtime adapter and Docker Compose deployment are not implemented. The current ingestion runtime is Cloudflare-specific; do not claim self-hosted ingestion support yet.

## Phase 3 — TypeScript SDK foundation (current)

Branch `feat/phase-3-typescript-sdk-foundation` introduces three workspace packages:
- `@jerico/sdk-core`: bounded in-memory queue, batch transport, explicit flush/close, metrics/logs/spans/events/errors, and error reporting.
- `@jerico/sdk-browser`: public-key-only browser client, anonymous session IDs, explicit identify/reset, page-view capture, window errors, and unhandled promise rejections.
- `@jerico/sdk-node`: secret-key-only Node client, telemetry methods, and opt-in unhandled-rejection capture.

The SDK requires an explicit ingestion endpoint; no hosted Jerico endpoint is assumed. Failed batches remain in memory for explicit flush. Automatic retries are intentionally disabled because the ingestion API does not yet support request-level idempotency and retrying ambiguous requests could duplicate accepted events. These packages are not yet validated by install/typecheck/tests/build and are not production-ready. Core Web Vitals, route-change instrumentation, OpenTelemetry integrations, framework examples, build artifacts, and published package release remain outstanding.

## Next milestones after Phase 2C

1. Stabilize the ingestion pipeline and its contracts.
2. Complete and validate the TypeScript browser and Node SDKs, then add integration examples.
3. Build dashboard query APIs and the Observability UI (events/errors/logs/metrics/traces).
4. Add uptime checks, alert rules, and notification channels.
5. Add usage metering/billing and production operational safeguards.
6. Implement self-hosted runtime/queue adapters and Docker Compose deployment.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry here.
