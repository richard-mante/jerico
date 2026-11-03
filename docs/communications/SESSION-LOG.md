# Jerico Session Log

## 2026-11-03 — CI runner diagnosis and explicit runner image

- Inspected GitHub Actions run #18 and its underlying job payload. The job has `runner_id: 0`, an empty `runner_name`, and `steps: []`; it starts and fails within seconds before a hosted runner is assigned. This is stronger evidence of a GitHub Actions runner-startup problem than a source-code/test failure, but the precise platform-side cause remains unknown.
- Updated `.github/workflows/ci.yml` to pin the runner label from `ubuntu-latest` to `ubuntu-24.04` for a stable, explicit LTS image.
- Workflow commit: `70a7e4d7399008e287bb17722f1d49f62b3ca421`.
- The subsequent run #20 executed against the updated workflow and still failed before runner allocation: `runner_id: 0`, empty runner name, no steps. Pinning the image did not resolve the issue.
- No CI job has reached checkout, pnpm setup, install, lint, typecheck, tests, or build. Do not report any of those checks as passing or failing.
- PR #2 remains open and must not be merged until the workspace is actually validated.

## 2026-11-03 — Phase 1 Hyperdrive lifecycle review

- Resumed PR #2 on `feat/phase-1-identity-tenancy`; confirmed the PR remains open and the head before this session was `7acd867df7fa8731f80f332de39e4407c8df8fec`.
- Confirmed Better Auth remains the selected self-hosted open-source auth library. It runs inside the Hono API Worker; no separate Better Auth hosting service is needed.
- Reviewed Cloudflare's current Hyperdrive, Drizzle, and node-postgres documentation. Confirmed `pg` + Drizzle is the documented integration and that a fresh `pg.Client` should be created within each Worker invocation. Hyperdrive owns the origin connection pool; Worker request connections are automatically cleaned up at invocation end.
- Updated `apps/api/src/database.ts` to avoid calling `client.end()` for Hyperdrive clients while retaining cleanup for the local direct-PostgreSQL fallback.
- Updated `docs/architecture/identity-and-tenancy.md` to document the self-hosted Better Auth model, request-scoped Hyperdrive connection lifecycle, and outstanding binding/secrets setup.
- Updated `docs/communications/CURRENT-STATE.md` with the implementation and validation status.
- Code commit: `7dad40c71b64a7f1a14ebb85ffacc72bf4d27464` (database lifecycle fix).
- Documentation commit: `80ae14fa18959ac5db187149138396ace0bfdb8e` (identity/tenancy architecture update). Current-state handover was then updated in a later docs commit.
- CI run #16 (created for the database lifecycle commit) failed in approximately three seconds before recording any job steps. GitHub reports `steps: null` and no downloadable logs. This does not identify a source-code failure and remains an unresolved GitHub Actions startup/runner issue.
- No dependency installation, lockfile generation, lint, typecheck, tests, build, PostgreSQL migration, or end-to-end authentication test was run. The Cloudflare Hyperdrive binding ID and deployment secrets are not configured.
- PR #2 remains open and must not be merged until checks and database integration validation pass.

## 2026-11-03 — Phase 1 invitation acceptance flow

- Re-inspected open PR #2 and the `feat/phase-1-identity-tenancy` branch.
- Confirmed the CI job still fails before recording any steps; GitHub reports `steps: null` and no downloadable logs. This remains an infrastructure/workflow-startup blocker, not a diagnosed source-code failure.
- Confirmed Better Auth's documented organization client API uses `authClient.organization.acceptInvitation({ invitationId })`.
- Added `apps/web/src/app/accept-invitation/[id]/page.tsx` with a signed-in acceptance action, clear signed-out guidance, email-match reminder, pending/error/success states, and redirect to the dashboard after acceptance.
- Commit: `076c755da75c0aa20f00270863d8a4f832cadaa6`.
- No dependency installation, lockfile generation, typecheck, build, tests, PostgreSQL migration, or end-to-end auth test was run. The invitation UI is implemented but remains unverified in a running app.
- PR #2 remains open and must not be merged until CI, build, tests, and database integration validation pass.

### Next
- Establish a runnable CI/local validation environment and resolve the GitHub Actions runner allocation issue.
- Generate and commit the pnpm lockfile; run lint/typecheck/tests/build.
- Add PostgreSQL-backed Better Auth and tenancy integration tests and apply the migration to a disposable database.
- Continue organization management/switching, project management, audit logging, and API-key lifecycle after Phase 1 validation.


## 2026-11-03 — Phase 2A project ingestion credentials

- Confirmed Phase 1 PR #2 is merged into `main` as `5952c67ead9868783a7d764d06ca78bf3d4fa37b`.
- Created `feat/phase-2-ingestion-credentials` from the merged `main` branch.
- Added `project_ingestion_keys` Drizzle schema and SQL migration `0001_project_ingestion_keys.sql`. Credentials are constrained to the same organization/project/environment through composite foreign keys; a composite unique index was added to environments for the environment ownership FK.
- Added `createIngestionKeySchema` to shared contracts and validation tests.
- Added Web Crypto credential generation in `apps/api/src/ingestion-keys.ts`: 256-bit random values with `jk_pub_` and `jk_sec_` prefixes; only SHA-256 hash and short prefix are stored.
- Added project credential API routes: list, create, and soft revoke. Membership is checked through the existing organization guard; owner/admin roles can create/revoke, members can list metadata. Raw credentials are returned only in the create response.
- Added a web project credential manager at `/dashboard/projects/[projectId]/keys`, with environment/type selection, one-time credential display/copy, metadata listing, and revocation. Added a dashboard link from each project row.
- Added `docs/roadmap/phase-2-credentials.md`, linked it from the implementation roadmap, updated the root README and current-state handover.
- Current feature branch: `feat/phase-2-ingestion-credentials`. Draft PR #3 opened at https://github.com/richard-mante/jerico/pull/3. Phase 2A implementation is not yet validated or merged.
- GitHub Actions run for PR #3 failed before runner allocation. The check completed without executing steps; no source-level failure details are available.
- No dependency install, lockfile generation, lint, typecheck, unit tests, build, PostgreSQL migration, or API integration test has been run. GitHub Actions runner allocation remains unresolved.
- The ingestion service remains intentionally disabled. No telemetry write endpoint, queue, ClickHouse storage, rate limiting, quota enforcement, or redaction is implemented in this milestone.

### Next
- Review the full Phase 2A diff for schema/migration consistency, authorization, and UI behavior.
- Establish a working validation environment; generate the pnpm lockfile and run lint/typecheck/tests/build.
- Apply migration to disposable PostgreSQL and test tenant/project/environment isolation and credential revocation.
- Only then open/merge Phase 2A PR and proceed to authenticated telemetry ingestion.


## 2026-11-03 — Phase 2B authenticated telemetry ingestion

- Continued on `feat/phase-2-ingestion-credentials` and extended draft PR #3: https://github.com/richard-mante/jerico/pull/3.
- Added bounded telemetry event/batch contracts in `packages/contracts/src/index.ts` for event, error, log, metric, and span records.
- Replaced the ingest placeholder with `POST /ingest/v1/events` in `apps/ingest/src/index.ts`. It parses bearer keys, hashes credentials, looks up active key hashes in PostgreSQL, derives organization/project/environment IDs from the stored credential, limits request bodies to 96 KiB and batches to 100 events, applies public-vs-secret event-type permissions, redacts common sensitive values, and queues a versioned envelope.
- Added credential parsing/hash helpers and tests in `apps/ingest/src/credentials.ts` and `credentials.test.ts`.
- Added redaction logic and tests in `apps/ingest/src/redaction.ts` and `redaction.test.ts`.
- Added Cloudflare Queue producer binding configuration in `apps/ingest/wrangler.jsonc`; added pg/Drizzle/database/contracts dependencies to the ingest app.
- Added `apps/worker` queue consumer. It batches queued records into ClickHouse HTTP `JSONEachRow` inserts, acknowledges successful writes, retries failed writes, and relies on Cloudflare Queue dead-letter routing after configured retries.
- Added ClickHouse row/identifier/write tests in `apps/worker/src/index.test.ts`.
- Added `infrastructure/clickhouse/init/001_telemetry_events.sql` with tenant dimensions, MergeTree ordering, 7-day log retention, and 30-day retention for other event types.
- Added `docs/roadmap/phase-2-ingestion.md`, updated architecture/roadmap/README, and refreshed this handover.
- Production requests fail closed if `APP_ENV=production` and the `INGEST_RATE_LIMITER` binding is missing. Actual Cloudflare rate-limit binding, queues, Hyperdrive, and ClickHouse resources still need account-level provisioning.
- No package install, lockfile generation, lint, typecheck, unit tests, build, DB migration, Cloudflare deployment, queue delivery, or ClickHouse integration test was run. GitHub Actions runner allocation remains unresolved.
- Known follow-up work: daily/monthly quotas, billing metering, idempotent event IDs, adaptive backpressure, self-hosted queue/runtime adapter, query APIs, and SDKs. Queue delivery is at-least-once and duplicate ClickHouse writes are possible in a crash-after-insert-before-ack scenario.

### Next
- Perform a full code/type review after a real pnpm install; fix compiler/runtime errors.
- Run all workspace checks and PostgreSQL integration tests.
- Provision and exercise the complete Cloudflare Queue → ClickHouse path, including retries and DLQ.
- Add idempotency and quota enforcement; implement self-hosted queue adapter before declaring the ingestion pipeline deployment-neutral.


- Follow-up hardening in the same Phase 2B branch: added `project_ingestion_usage` with migration `0002_project_ingestion_usage.sql`, an atomic per-project daily counter (default 100,000 events per UTC day), 429 responses with reset guidance, and quota refund when queue publication fails. Added unit tests for UTC date boundaries, reset countdown, and limit configuration.
- Added explicit JSON content-type enforcement and inline secret-assignment redaction coverage.
- Updated Phase 2B docs, roadmap, current-state handover, and PR #3 description to reflect daily quota behavior. Monthly plan tiers/billing metering remain out of scope.
- Latest validation remains pending; no local package install or automated checks were executed.


## 2026-11-03 — Phase 2 merged; Phase 2C validation handover

- Verified PR #3 is merged and closed: https://github.com/richard-mante/jerico/pull/3.
- Merge commit: `d0430e584f496057ca73dda70e6df718a290e8ea` (squash merge). Phase 2A credentials and Phase 2B authenticated telemetry ingestion are now on `main`.
- Re-checked the latest Actions run on the merge commit: run #73 / ID `41559078138`, triggered by the push to `main`. It failed within seconds. The job response contains `steps: null`, no runner/log URL, and no evidence that a hosted runner was assigned. This matches the earlier runner-startup pattern; the exact cause remains unknown and no code checks ran.
- Inspected current `main` configuration: root package manager is pnpm 12.7.0; workspace globs are `apps/*` and `packages/*`; CI currently runs install, lint, typecheck, test, and build, but the repository still has no committed `pnpm-lock.yaml`.
- Inspected Drizzle schema and journal. The journal lists migrations 0000–0002, while the initial migration snapshot is absent. Schema/migration consistency and migration execution therefore remain explicit validation tasks; no database was available through the GitHub-only workflow in this session.
- Corrected `docs/communications/CURRENT-STATE.md`: PR #3 is no longer described as an open draft; it now records the actual merge SHA, current validation blockers, infrastructure gaps, and next milestones.
- No dependency install, lockfile generation, lint, typecheck, unit tests, build, PostgreSQL migration, Cloudflare provisioning, or end-to-end ingestion test was run in this session.
- Current branch: `chore/phase-2c-validation-handover`.

### Next
- Continue Phase 2C by establishing an executable validation environment, generating the pnpm lockfile, and running the full workspace checks.
- Fix issues found by those checks; verify Drizzle migrations against disposable PostgreSQL.
- Provision and test Hyperdrive, Cloudflare Queues, Rate Limiting, and ClickHouse before calling ingestion production-ready.


## 2026-11-03 — Phase 2C event-level queue deduplication

- Merged documentation handover PR #4 to `main` as `9c7ca2e161ccf3f98c81ed57f5525ab8fabfebb1`.
- Reviewed the current ingestion-to-ClickHouse path and confirmed the at-least-once queue consumer could write duplicate rows after a successful ClickHouse insert followed by a crash before queue acknowledgement.
- Started `feat/phase-2c-queue-deduplication` from `main`.
- Added a server-generated `eventId` to every accepted event before queue publication. The ID is carried in the queued envelope, so queue retries/redeliveries retain the same ID.
- Updated the ClickHouse writer to persist `event_id`; updated the initial ClickHouse table to use `ReplacingMergeTree` and include `event_id` in the sorting key.
- Updated worker unit tests and Phase 2B documentation to describe eventual deduplication and its limits. Client retries after ambiguous HTTP responses remain separate accepted events; strict immediate uniqueness is not claimed.
- No dependency install, typecheck, tests, build, ClickHouse SQL execution, or end-to-end queue test was possible through the GitHub-only workflow. CI runner allocation remains unresolved.

### Next
- Review the branch diff and open a focused PR for event-level deduplication.
- Validate ClickHouse `ReplacingMergeTree` behavior and query semantics against a real ClickHouse instance; run the workspace checks when a local environment is available.
- Continue with SDK design only after ingestion contracts and runtime validation are stable.


## 2026-11-03 — Phase 3 TypeScript SDK foundation

- Merged PR #5 to `main` as `b6515688db8dc9e688e70b52635019848ed0967c`. The merged ingestion pipeline now assigns event IDs before queue publication and ClickHouse uses `ReplacingMergeTree` to eventually collapse queue-redelivery duplicates.
- Started `feat/phase-3-typescript-sdk-foundation`.
- Added `@jerico/sdk-core` with bounded in-memory buffering, batch transport, explicit flush/close, custom events, errors, logs, metrics, spans, and transport error reporting.
- Added `@jerico/sdk-browser` with public-key enforcement, page-view capture (pathname/title only), window error and unhandled promise rejection capture. It blocks logs/metrics/spans because public credentials are restricted to event/error types by the ingest API.
- Added `@jerico/sdk-node` with secret-key enforcement, telemetry methods, and opt-in unhandled rejection capture.
- Added package-level unit tests and initial SDK usage/privacy documentation. SDK packages require an explicit endpoint; no unverified hosted ingest domain is assumed.
- Automatic SDK retries are deliberately disabled: the API does not yet provide request-level idempotency, so retrying an ambiguous request could duplicate accepted telemetry. Failed batches are retained in memory for explicit flush; the SDK is not a durable local spool.
- No dependency installation, lockfile generation, lint, typecheck, tests, builds, or runtime integration tests were run. GitHub Actions runner allocation remains a blocker, so package code is not yet verified.
- Follow-up: inspect SDK diff, fix any local validation failures when the workspace can be installed, add browser session/identify/reset and Core Web Vitals, and provide Next.js/Astro/React/Express examples.

### Next
- Validate the SDK packages with a real pnpm install, lint, typecheck, tests, and builds.
- Add integration coverage against the ingestion Worker and a local queue/ClickHouse stack.
- Add request-level idempotency before introducing automatic retries.


- Follow-up Phase 3 hardening: added client-side payload bounds matching the ingestion contract (event names, attribute keys/values, and messages); isolated user-supplied SDK error callbacks so they cannot crash the host application.
- Added browser anonymous session IDs stored in `sessionStorage` with an in-memory fallback, plus explicit `identify()` and `reset()` APIs. User identity is never collected automatically.
- Updated browser SDK and Phase 3 documentation. These additions are still unvalidated because package installation and automated checks have not run.


- CI follow-up for PR #6: run #82 (ID `41562084344`) completed as failure before runner assignment. The job response again reports `steps: null` and no downloadable logs. This is not evidence of a source-level failure, and no SDK checks have run.


- Added documentation-only Next.js App Router and Express/Node integration examples under `docs/examples/`. The examples are not yet executed in sample applications; the Next.js page-view example explicitly avoids double-counting the initial route.


- After adding the Next.js and Express examples, latest PR #6 CI run #94 (ID `41562241700`) also failed before runner assignment; GitHub returned `steps: null` and no logs. No lint, typecheck, tests, or build steps executed.


## 2026-11-03 — Phase 3 SDK foundation merged

- Merged PR #6, “feat: add TypeScript browser and Node SDK foundations”, to `main`.
- Merge commit: `d4894534940805f08ae0bc2e0d591e3762c7cd3a`.
- Confirmed PR #6 is closed and merged; no other open pull requests were returned by the repository's open-PR query.
- The merged PR contains `@jerico/sdk-core`, `@jerico/sdk-browser`, and `@jerico/sdk-node`, package-level tests, Next.js and Express integration examples, and Phase 3 documentation.
- Updated the handover and roadmap to reflect that Phase 3 is merged, not an unmerged branch. Marked only implemented capabilities as complete; validation and production readiness remain explicitly outstanding.
- Checked workflow runs for the merge commit; GitHub returned no associated workflow runs at the time of inspection. This does not establish that checks passed.
- No dependency installation, lockfile generation, lint, typecheck, unit tests, build, PostgreSQL integration, ClickHouse integration, or live SDK ingestion test was executed in this session.
- Outstanding blockers: no committed `pnpm-lock.yaml`; GitHub Actions hosted runner allocation has repeatedly failed before steps execute; no disposable PostgreSQL/ClickHouse or provisioned Cloudflare resources are connected to this session.
- Next: resolve a runnable validation path, generate the lockfile, execute all workspace checks, then add request-level ingestion idempotency and end-to-end SDK-to-ingestion tests before starting dashboard query APIs.



## 2026-11-03 — Phase 4 observability query API (first slice in progress)

- Created branch `feat/phase-4-observability-query-api` from current `main`. PR #8 (request-level ingestion idempotency) remains open and unmerged; this Phase 4 work is isolated from it.
- Inspected the existing Hono API organization membership guard, PostgreSQL project/environment schema, ClickHouse telemetry table, and Worker writer shape.
- Added `apps/api/src/telemetry-query.ts` with a ClickHouse HTTP query adapter, strict database/table identifier validation, parameterized tenant/project/environment/time/type filters, 31-day time-range validation, page-size bounds, opaque keyset cursor helpers, and safe server-side ClickHouse error handling.
- Added authenticated API routes for project events, errors, and logs. Each route checks organization membership using the existing guard, verifies that the project belongs to that organization, validates any environment filter against the same project, and queries ClickHouse with organization + project scope.
- Added unit tests for time range validation, page limits, cursor parsing, query parameter binding, and identifier injection rejection.
- Added ClickHouse API Worker local environment examples and `docs/roadmap/phase-4-observability.md`.
- Updated the implementation roadmap and current-state handover.
- No package install, lint, typecheck, tests, build, PostgreSQL integration, ClickHouse query, or route authorization integration test was executed. GitHub Actions runner allocation remains an unresolved blocker.
- Extended the first slice with metrics and spans list routes and a project overview aggregation endpoint covering counts for all five telemetry types and latest event time. Added overview query tests and documented the fact that ReplacingMergeTree counts may temporarily include duplicate queue deliveries before background merges.
- Added the first live web explorer at `/dashboard/projects/:projectId/observability`, linked from project cards. It loads the user's organizations, project environments, overview counts, and selected telemetry stream; supports organization/environment/time filters, five telemetry tabs, cursor-based pagination, and loading/empty/error/unauthenticated states.
- Updated the Phase 4 roadmap and current-state handover to reflect the API and UI slice.
- Next: add route-level tenant isolation tests, verify ClickHouse SQL against a real instance, and improve the explorer with error grouping, metric charts, and trace detail. Do not call Phase 4 complete until browser and cross-tenant integration tests pass.


## 2026-11-03 — Phase 4 grouped error query

- Continued work on the existing `feat/phase-4-observability-query-api` branch and PR #9.
- Added a ClickHouse query adapter that groups error telemetry by a query-time fingerprint derived from error name and message, returning occurrence count, first/last seen timestamps, latest message, and latest event ID.
- Added authenticated `GET /api/v1/projects/:projectId/telemetry/errors/groups`. It reuses the organization membership guard, checks project ownership, validates optional environment ownership in PostgreSQL, bounds time range and limit, and binds tenant/project/environment values in ClickHouse query parameters.
- Added unit coverage for grouping output and tenant/project/environment query binding.
- Important limitation: the fingerprint is not stored, message changes split groups, and there are no issue resolve/ignore actions or stack-trace aggregation yet. The endpoint returns at most 100 groups.
- No lint, typecheck, tests, build, ClickHouse SQL execution, PostgreSQL integration, or browser validation was run. GitHub Actions currently fails before runner steps are available.


## 2026-11-03 — Merge Phase 4 query API and grouped-error UI

- Merged PR #9 into `main` using squash merge; merge commit `1918f231ea1feb976de87ecf419bb41c9bbb971e`. The PR documents that CI runner allocation and all local/integration checks remain unresolved; merge is not evidence of passing tests.
- Created `feat/phase-4-error-groups-ui` from `main`.
- Updated `apps/web/src/components/project-observability.tsx`: the Errors tab now calls `/telemetry/errors/groups` and renders grouped errors with occurrence counts, first/last seen timestamps, latest message, and latest event ID. Other telemetry tabs retain their existing paginated list behavior.
- No local lint, typecheck, test, build, or browser run was available through the GitHub repository connector. API/ClickHouse integration remains unverified.


## 2026-11-03 — Phase 4 metric time-series slice

- Created `feat/phase-4-metric-series` from `main` after merging PR #10.
- Added `queryTelemetryMetricSeries` in `apps/api/src/telemetry-query.ts`; ClickHouse aggregation is tenant/project/environment scoped, uses a server-selected fixed bucket interval (1/15/60/360 minutes), and returns average/minimum/maximum/sample count.
- Added `GET /api/v1/projects/:projectId/telemetry/metrics/series` with the existing membership/project/environment checks, 31-day range validation, and sanitized failures.
- Added a query-adapter unit test for metric bucketing and parameter binding (authored, not executed).
- Updated the Metrics tab to render responsive SVG average-value charts for up to eight metric names. No charting dependency added.
- No local lint, typecheck, tests, build, ClickHouse execution, or browser validation was run.


## 2026-11-03 — Phase 4 span trace waterfall

- Created `feat/phase-4-trace-waterfall` from `main` after merging PR #11.
- Updated the Traces tab in `apps/web/src/components/project-observability.tsx` to group loaded spans by `attributes.traceId`; spans without a trace ID are displayed independently to avoid false grouping.
- Added timeline-relative duration bars using the existing span `value` in milliseconds, plus span ID and parent-span indicators when supplied in attributes.
- No API changes or new dependencies were needed. No lint, typecheck, tests, build, or browser validation was run.
- Limitation: the SDK does not automatically create or propagate trace/span IDs; this view is best-effort and limited to loaded rows.


## 2026-11-03 — Phase 4 error stack details

- Created `feat/phase-4-error-stack-details` from `main` after merging PR #12.
- Extended `queryTelemetryErrorGroups` to extract the latest event's `attributes.stack` using ClickHouse JSON extraction and return it as `latestStack`.
- Added unit test fixture/assertion for latest stack extraction (authored, not executed).
- Updated grouped error cards with a collapsed, scrollable stack-trace disclosure. Stack content is rendered as text.
- No lint, typecheck, tests, build, ClickHouse SQL execution, or browser validation was run.


## 2026-11-03 — Phase 4 structured logs

- Created `feat/phase-4-structured-logs` from `main` after merging PR #13.
- Added `LogLevel` and `logWithLevel()` to `@jerico/sdk-core`; legacy `log()` now writes `info` by default. Browser SDK explicitly rejects `logWithLevel()` just as it rejects `log()`.
- Added Node SDK documentation and SDK unit coverage for severity metadata.
- Added optional `level` filtering to API log queries with strict supported-level validation and ClickHouse parameter binding; historical entries without a level default to `info` in the query.
- Added API unit coverage for severity parameter binding and a Logs-tab severity selector that persists across Load more.
- No lint, typecheck, tests, build, or live ClickHouse/browser validation was run.


## 2026-11-03 — Phase 4 SDK trace context helpers

- Created `feat/phase-4-sdk-span-context` from `main` after merging PR #14.
- Added `SpanContext`/`SpanHandle`, `startSpan()`, and `withSpan()` to `@jerico/sdk-core`. Root spans generate trace IDs, child spans reuse trace ID and parent span ID, and durations/status are recorded in existing span telemetry fields.
- Browser SDK explicitly rejects the server-only span helpers.
- Added tests for parent/child correlation, duration metadata, idempotent end, and error status (authored, not executed).
- Updated Node SDK usage documentation and Phase 4 handover.
- No lint, typecheck, tests, build, or runtime validation was run.


## 2026-11-03 — Carry forward request idempotency onto current main

- Reviewed open PR #8 and confirmed it was not mergeable against the current mainline after later SDK/observability changes. Kept the original PR open while carrying its implementation onto a fresh branch from current `main`.
- Added the credential-scoped idempotency table and migration `0003_project_ingestion_requests.sql`, canonical request hashing, deterministic event IDs, persisted pending/accepted queue envelopes, 24-hour expiry, and 15-minute scheduled cleanup.
- Updated the ingestion Worker to accept `Idempotency-Key`, replay accepted requests without a second quota reservation, reject same-key/different-payload requests, and re-publish pending envelopes with stable event IDs.
- Updated SDK core to attach one idempotency key to each batch and reuse the exact body/key on explicit retry while preserving later merged structured logging and span helpers.
- Added/updated SDK and ingestion helper tests and updated Phase 2/3 docs. Tests remain authored but unexecuted.
- No local dependency install, lint, typecheck, tests, build, PostgreSQL migration, Cloudflare Queue, or ClickHouse integration validation was run.


## 2026-11-03 — Phase 4 event catalogue

- Merged PR #16 request-level ingestion idempotency into `main` (merge commit `932abd421c516ef311388f6866a91b75bd5dd763`) and closed stale PR #8 as superseded by PR #16.
- Created `feat/phase-4-event-catalogue` from current `main`.
- Added `queryTelemetryEventCatalogue` and authenticated `GET /api/v1/projects/:projectId/telemetry/events/catalogue`, scoped by organization/project/environment and bounded to 100 event names.
- Added query-adapter test coverage for event catalogue output and tenant/environment parameter binding (authored, not executed).
- Updated the Events tab to show event counts, relative count bars, last-seen timestamps, and latest event IDs.
- No lint, typecheck, tests, build, ClickHouse SQL execution, or browser validation was run.


## 2026-11-03 — Phase 4 latest event details

- Created `feat/phase-4-event-details` from `main` after merging PR #17.
- Extended event catalogue summaries with the latest event message and up to 4 KiB of serialized attributes using ClickHouse `argMax` and `substring`.
- Updated the Events tab to reveal the latest message/attributes in a collapsed, scrollable text disclosure; response size is bounded and content is rendered as text.
- Added query-adapter fixture/assertion coverage (authored, not executed).
- No lint, typecheck, tests, build, ClickHouse SQL execution, or browser validation was run.


## 2026-11-03 — Phase 4 event volume charts

- Created `feat/phase-4-event-series` from `main` after merging PR #18.
- Added `queryTelemetryEventSeries` and authenticated `GET /api/v1/projects/:projectId/telemetry/events/series`, using verified tenant/project/environment filters and adaptive fixed buckets of 1, 15, 60, or 360 minutes.
- Bounded the event series query to the top eight event names and 1,200 bucket rows.
- Updated the Events tab to fetch and display responsive SVG event-volume charts alongside the catalogue and latest-event details.
- Added query-adapter unit coverage for event count aggregation and tenant/environment parameter binding (authored, not executed).
- No lint, typecheck, tests, build, ClickHouse SQL execution, or browser validation was run.


## 2026-11-03 — Phase 4 error group lifecycle

- Created `feat/phase-4-error-lifecycle` from `main` after merging PR #19.
- Added `project_error_group_states` with project/fingerprint primary key, same-organization composite foreign key, `open|resolved|ignored` check constraint, updater reference, and migration `0004_project_error_group_states.sql`.
- Grouped-error GET now overlays persisted status (default `open`) and returns whether the current organization role can manage state.
- Added POST status action guarded by owner/admin role; members remain read-only. Added a status selector to grouped-error cards for authorized users.
- No migration execution, API integration tests, lint, typecheck, tests, build, or browser validation was run.


## 2026-11-03 — Phase 4 error occurrence drill-down

- Created `feat/phase-4-error-occurrences` from `main` after merging PR #20.
- Added optional bound `errorFingerprint` filtering to the ClickHouse query adapter using the same `cityHash64(name, message)` expression as grouped errors.
- Added authenticated `GET /api/v1/projects/:projectId/telemetry/errors/groups/:fingerprint/occurrences` with organization/project/environment checks, bounded range/limit, opaque cursor validation, and keyset pagination.
- Added query-adapter test coverage for fingerprint parameter binding (authored, not executed).
- Updated grouped error cards to expand and load the latest 20 occurrences with timestamp, event ID, and message. Cached occurrence data resets when the time/environment filters change.
- No lint, typecheck, tests, build, ClickHouse execution, or browser/API integration validation was run.


## 2026-11-03 — Phase 4 route authorization tests

- Created `feat/phase-4-api-route-tests` from `main` after merging PR #21.
- Added `apps/api/src/index.test.ts` with mocked auth/database adapters to exercise unauthenticated rejection, organization-member write denial, cross-organization project isolation, and owner status updates through Hono routes.
- Tests are authored but not executed. No dependency install, lint, typecheck, test run, build, PostgreSQL integration, ClickHouse integration, or browser validation was performed.
