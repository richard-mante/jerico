# Jerico — Current Project Handover

**Last updated:** 2026-11-03  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Current work branch:** `feat/phase-4-observability-query-api`  
**Current milestone:** Phase 4 — tenant-safe observability query API (first slice in progress)

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

### Phase 4 — Observability query API (in progress)

Branch: `feat/phase-4-observability-query-api`.

The first API slice adds authenticated, organization/project-scoped read endpoints for events, errors, and logs. It verifies project ownership through PostgreSQL before querying ClickHouse, validates optional environment filters against the same project, bounds time ranges to 31 days, limits pages to 100 rows, uses opaque keyset cursors, binds ClickHouse values as query parameters, and keeps ClickHouse credentials server-side. The API returns 503 when ClickHouse is not configured and does not expose raw ClickHouse errors.

Files added/updated:
- `apps/api/src/telemetry-query.ts`
- `apps/api/src/telemetry-query.test.ts`
- `apps/api/src/index.ts`
- `apps/api/.dev.vars.example`
- `docs/roadmap/phase-4-observability.md`

The API also exposes metrics and spans list routes plus a project overview aggregate for counts by telemetry type and latest event time. A first web explorer is implemented at `/dashboard/projects/:projectId/observability`, with overview cards, organization/environment/time filters, signal tabs, cursor pagination, and loading/empty/error states. Charts, error grouping, metric visualization, and span waterfalls remain future work. The tests are authored but not executed. PostgreSQL/ClickHouse integration, query performance, and route-level tenant isolation tests remain outstanding.

### Known product gaps

- The first live observability explorer and tenant-scoped query API are merged; charting, error grouping, metric visualization, span waterfalls, and route-level integration validation remain outstanding.
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
4. Merge and validate the first Phase 4 query API/explorer slice, then add charts, error grouping, metric visualization, and trace detail.
5. Add uptime checks, alert rules, and notification channels.
6. Add usage metering/billing and production operational safeguards.
7. Implement self-hosted runtime/queue adapters and Docker Compose deployment.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry here.


### Phase 4 follow-up — grouped errors API (merged PR #9)

- Added a tenant-scoped error-group query adapter and `GET /api/v1/projects/:projectId/telemetry/errors/groups`.
- Groups are derived at query time from error name + message and include occurrence count, first/last seen, latest message, and latest event ID. This is not a persisted issue fingerprint or error lifecycle system.
- Added a query-adapter unit test for organization/project/environment parameter binding. Tests remain unexecuted; PostgreSQL/ClickHouse integration and browser validation remain outstanding.


### Phase 4 grouped errors dashboard (PR #10)

- PR #9 has been merged into `main` (merge commit `1918f231ea1feb976de87ecf419bb41c9bbb971e`).
- Follow-up branch `feat/phase-4-error-groups-ui` displays grouped errors in the project Errors tab using the new grouped-error API.
- Each group shows name, latest message, occurrence count, first/last seen, and latest event ID. The API currently caps groups at 100 and does not provide group pagination or issue lifecycle actions.
- PR #10 is the UI follow-up; lint/typecheck/tests/build and browser/API integration validation remain unexecuted.


### Phase 4 metric series (PR #11)

- PR #10 merged grouped errors into `main` (merge commit `b245ce1020c644eff617e77c6b7feb4a65370a1d`).
- Branch `feat/phase-4-metric-series` adds a tenant-scoped metric aggregation endpoint and responsive SVG charts in the dashboard Metrics tab.
- Metric buckets include average/minimum/maximum/sample count; bucket size adapts to the time range and the query is bounded to the top eight metric names and 1,200 rows.
- PR #11 is the metric visualization follow-up. No lint/typecheck/tests/build or live ClickHouse/browser validation has been run.


### Phase 4 trace waterfall (PR #12)

- PR #11 merged metric time-series aggregation and SVG charts into `main` (merge commit `a65c6a41d0bb40895e06cf23cc1e267ed0c78cfc`).
- Branch `feat/phase-4-trace-waterfall` adds best-effort span grouping by `attributes.traceId`, standalone handling when trace IDs are absent, parent-span indication, duration bars, and duration labels.
- The current SDK span method stores duration in milliseconds in `value`; trace/span IDs must be supplied manually in attributes. Automatic trace context propagation is not implemented.
- PR #12 is the trace visualization follow-up. Validation remains outstanding.


### Phase 4 error stack details (PR #13)

- PR #12 merged the best-effort span waterfall into `main` (merge commit `75d7f7a76effa00aed840ffbfc35623e75c438df`).
- Branch `feat/phase-4-error-stack-details` adds the latest captured error stack to grouped-error results and a collapsed, scrollable stack disclosure in the Errors tab.
- Stack content is rendered as text; groups without stack data do not show the disclosure. Only the latest stack is included.
- PR #13 is the stack-detail follow-up. Validation remains outstanding.


### Phase 4 structured log levels (PR #14)

- PR #13 merged latest stack trace details into `main` (merge commit `9ce277e06fc5267da7ab4f9bf345feb1c16079af`).
- Branch `feat/phase-4-structured-logs` adds `logWithLevel()` to the trusted Node/core SDK, defaults existing `log()` calls to `info`, and keeps browser log submission blocked.
- API logs query accepts `level=debug|info|warn|error|fatal`; legacy logs without a level are treated as `info`. The dashboard Logs tab includes a severity selector.
- PR #14 is the structured logging follow-up. Validation remains outstanding.


### Phase 4 SDK trace context (PR #15)

- PR #14 merged structured log severity into `main` (merge commit `7488712a2c7693d5adebe71c45e2b8bf3d4a6e9e`).
- Branch `feat/phase-4-sdk-span-context` adds `startSpan()` and `withSpan()` to the core/Node SDK. Root spans generate trace IDs; nested spans accept parent context and record parent IDs. Duration and ok/error status are captured automatically.
- Browser SDK explicitly blocks these server-only span helpers. Context propagation remains explicit; no framework/async-local integration is included.
- PR #15 is the trace SDK follow-up. Validation remains outstanding.


### Request-level ingestion idempotency (PR #16)

- The older PR #8 was not mergeable against the current `main` because its SDK and documentation changes overlapped later merged work. Its implementation has been carried forward onto `feat/phase-3-request-idempotency-mainline`.
- Adds credential-scoped idempotency records, canonical payload hashing, deterministic event IDs, pending/accepted queue envelopes, 24-hour expiry, scheduled cleanup, and SDK batch key/body reuse on explicit retry.
- Daily quota is reserved atomically with the first idempotency record. Pending quota is conservatively not refunded at expiry because queue acceptance may be ambiguous.
- PR #16 is the rebased mainline implementation. No local install/lint/typecheck/tests/build, PostgreSQL migration, Cloudflare Queue, or ClickHouse integration test has been run.


### Phase 4 event catalogue (PR #17)

- PR #16 merged request-level ingestion idempotency into `main` (merge commit `932abd421c516ef311388f6866a91b75bd5dd763`); the older conflicting PR #8 was closed as superseded.
- Branch `feat/phase-4-event-catalogue` adds a tenant-scoped event catalogue endpoint and a top-events view in the dashboard Events tab.
- The catalogue returns up to 100 event names ranked by count, with last-seen and latest event ID. Counts may include duplicates until ClickHouse background merges complete.
- PR #17 is the event analytics follow-up. Validation remains outstanding.
