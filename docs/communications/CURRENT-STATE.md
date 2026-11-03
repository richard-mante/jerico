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


### Phase 4 latest event details (PR #18)

- PR #17 merged the top event catalogue into `main` (merge commit `e5840289317795f84eb44e9e63a4e55963c42273`).
- Branch `feat/phase-4-event-details` adds the latest event message and up to 4 KiB of serialized attributes to each catalogue row, shown in a collapsed details disclosure.
- This is a latest-occurrence preview only; older occurrence history and full event detail retrieval are not included. Validation remains outstanding.


### Phase 4 event volume charts (PR #19)

- PR #18 merged latest event message/attributes into the Events catalogue (merge commit `5afe2343cf075d1260e0160437d92d4f007138af`).
- Branch `feat/phase-4-event-series` adds tenant-scoped event count aggregation at adaptive 1/15/60/360-minute intervals and SVG charts for the top eight event names.
- The Events tab shows time-series charts plus the catalogue and latest-event details. Counts can temporarily include duplicate queue deliveries.
- PR #19 is the event trend visualization follow-up. Validation remains outstanding.


### Phase 4 error group lifecycle (PR #20)

- PR #19 merged event-volume time-series charts into `main` (merge commit `cd05481b93f5d63425f91c87a5a5bbe6b816fec2`).
- Branch `feat/phase-4-error-lifecycle` adds a PostgreSQL state table for project/fingerprint status (`open`, `resolved`, `ignored`), merges state into grouped-error responses, and adds owner/admin-only status updates.
- Members can read status but cannot change it. No assignment, comments, notifications, or audit trail are included.
- PR #20 is the error lifecycle follow-up. Migration `0004_project_error_group_states.sql` and runtime integration are not validated.


### Phase 4 error occurrence drill-down (PR #21)

- PR #20 merged persisted error lifecycle state into `main` (merge commit `97cf65478d232308fbaa031bff77a1c3c46aba26`).
- Branch `feat/phase-4-error-occurrences` adds a tenant-scoped, cursor-paginated endpoint filtered by the same error-group fingerprint and an expandable latest-20 occurrence list in the Errors tab.
- Occurrence UI currently shows timestamp, event ID, and message; per-occurrence stack/attributes and UI pagination remain open.
- PR #21 is the occurrence drill-down follow-up. Validation remains outstanding.


### Phase 4 route authorization tests (PR #22)

- PR #21 merged grouped error occurrence drill-down into `main` (merge commit `89f7c8ad75a7d0566b9a5de3f6878c7dedbb3ebe`).
- Branch `feat/phase-4-api-route-tests` adds Hono route tests for unauthenticated access, member write denial, cross-organization project isolation, and owner status updates using mocked session/database adapters.
- These tests are authored but not executed and do not replace PostgreSQL/ClickHouse integration validation.
- PR #22 is the route-authorization test follow-up.


### Phase 4 ClickHouse integration harness (PR #23)

- PR #22 merged mocked Hono route authorization tests into `main` (merge commit `604af9d7051bbd8f78b5df2e7943bf2e00430935`).
- Branch `feat/phase-4-clickhouse-integration-tests` adds a gated real-ClickHouse query integration suite, a Docker Compose ClickHouse service, an API integration-test script, and CI service wiring.
- The suite covers overview, error groups/stack, fingerprint occurrences, event catalogue/details/series, metric aggregation, and structured log severity.
- The suite has not been executed successfully in this environment; CI runner allocation remains unresolved.


### Phase 4 trace detail drill-down (open PR)

- Added a trace ID filter to the authenticated spans query. The trace ID is bound as a ClickHouse parameter; organization/project/environment/time-range checks and cursor pagination remain in force.
- Added a dashboard action to load a trace independently of the initial project-wide span page, render its span details, and load subsequent pages.
- Added query-adapter unit coverage and a gated real-ClickHouse integration case for trace-scoped retrieval. Tests are authored but not executed.
- This is a trace detail list, not a service map or cross-project trace search. No lint, typecheck, tests, build, ClickHouse integration, or browser validation has run for this slice.


### Phase 4 trace detail drill-down — merged PR #24

- PR #24 merged into `main` (merge commit `0b2e358c3559f47def075ab1ce10489790ccc0de`).
- The authenticated spans query accepts a bound trace ID filter and retains organization/project/environment/time/cursor constraints. The Traces tab can load a trace independently and paginate through its spans.
- Query-adapter unit and gated ClickHouse integration coverage were added, but tests have not been executed and browser validation remains outstanding.

### Browser Core Web Vitals — current open work

- Branch `feat/browser-core-web-vitals` adds opt-in `captureWebVitals` to the browser SDK.
- It observes TTFB, FCP, LCP, CLS session windows, and an INP estimate. Metrics are recorded internally; browser callers still cannot submit arbitrary custom metrics.
- Public-key ingestion permits only five exact `web.vitals.*` metric names alongside events/errors. Custom metrics, logs, and spans remain restricted to secret credentials.
- Added allowlist tests for the SDK and ingestion helper. No lint, typecheck, unit tests, build, integration test, or browser test has been run. INP/CLS behavior still needs comparison against the official `web-vitals` library.


### Core Web Vitals dashboard — current open work

- Branch `feat/core-web-vitals-dashboard` adds per-bucket p50/p75/p95 aggregation to the metric-series query and returns unit/rating metadata from metric attributes.
- Metrics cards show latest average with unit, latest rating, and p50/p75/p95 summaries.
- Browser Web Vitals SDK metrics now attach `ms`/ `score` units and good/needs-improvement/poor ratings using the standard thresholds.
- Added unit and gated ClickHouse integration assertions for percentiles and metadata. No tests, lint, typecheck, build, ClickHouse integration, or browser validation has been run.


### Route-level Core Web Vitals — current open work

- Branch `feat/route-performance-breakdown` adds `GET /api/v1/projects/:projectId/telemetry/metrics/routes`, grouping the five allowlisted browser Web Vitals by pathname.
- Each route/metric result includes sample count, p75, p95, unit, and latest sample rating. The Metrics tab now displays route-level cards.
- Web Vitals path attribution is captured at SDK initialization so a later SPA pathname change does not relabel the initial document's measurements.
- Added query-adapter, mocked tenant-isolation, and gated ClickHouse integration coverage. No lint, typecheck, tests, build, ClickHouse integration, or browser validation has been run.
- Limitation: raw pathname grouping is not route-template normalization and can create high cardinality if applications place IDs in path segments.


### Route-template normalization — current open work

- Branch `feat/route-template-normalization` adds default normalization for UUID, long hexadecimal, and long numeric path segments; query strings/fragments are removed and route length is bounded.
- Browser SDK accepts `resolveRoute(pathname)` for framework-specific route templates. Resolver exceptions fall back to built-in normalization.
- Both page views and Core Web Vitals use normalized paths, reducing common dynamic-ID cardinality. Arbitrary dynamic slugs still require an app-provided resolver.
- Added pure unit tests for default normalization, query/fragment removal, length bounds, custom templates, and resolver fallback. No lint, typecheck, tests, build, or browser validation was run.


### Phase 5A — uptime monitor management (open PR)

- Added `uptime_monitors` and `uptime_check_results` PostgreSQL tables with same-organization/project composite foreign keys, bounded interval/timeout/status constraints, due-check index, and monitor history indexes.
- Added migration `0005_uptime_monitors.sql` and registered it in the Drizzle journal.
- Added strict create/update contracts for HTTP(S) URLs, GET/HEAD, interval 60–86400 seconds, timeout 1–30 seconds, and expected status 100–599. URL credentials are rejected.
- Added project-scoped monitor list/create/update/pause/delete and check-history read APIs. Owner/admin roles manage monitors; project/org membership is checked on every route.
- Added a project uptime management page with create/edit/pause/delete and history disclosure, linked from project cards.
- Important: this is configuration-only. No scheduler, outbound probes, history writes, uptime status, or incidents exist yet. The UI explicitly says checks are not running. SSRF/DNS/redirect protections must be implemented before enabling probes.
- Tests are authored but not executed. No migration, lint, typecheck, tests, build, database integration, or browser validation was run.


### Phase 5B — scheduled uptime probe pipeline (open PR)

- Added API Cron scheduling every minute. Due monitors are claimed by conditionally advancing `next_check_at`, then sent to `jerico-uptime-probes`.
- Added a Worker queue consumer that uses bounded HTTP(S) GET/HEAD requests, rejects IP literals/local/internal/reserved hostname suffixes and unsupported ports, follows at most three manually revalidated redirects, enforces timeouts, and cancels response bodies.
- Added a shared-secret internal API callback with constant-time comparison, a strict result contract, a 4 KiB request-body limit, transactional result persistence, and check-ID idempotency.
- Added probe queue retries and a dead-letter queue; the UI now distinguishes configured queue from real stored check results.
- Critical deployment constraint: the probe Worker must remain on workers.dev with no custom-domain route, VPC binding, or private outbound network. Private-address/DNS-rebinding safety relies on Workerd's default public-only global fetch egress. The implementation does not use TCP sockets.
- Cloudflare queues and secrets are not provisioned; migration 0005, scheduler, queue, and callback have not been executed in a deployed environment. Tests are authored but not run.
