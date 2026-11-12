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


## 2026-11-03 — ClickHouse integration harness

- Created `feat/phase-4-clickhouse-integration-tests` from `main` after merging PR #22.
- Added `apps/api/src/telemetry-query.integration.test.ts`, a gated suite that creates a uniquely named ClickHouse table, inserts tenant-scoped fixtures, exercises overview/grouping/fingerprint/event/metric/log queries against a real ClickHouse HTTP endpoint, and drops the table afterward.
- Added `docker-compose.integration.yml` with a local ClickHouse service and `@jerico/api` `test:integration` script.
- Updated CI to provision ClickHouse and run the integration suite.
- The integration suite is authored and wired but not executed here. No local Docker, lint, typecheck, unit tests, build, or successful CI result has been observed.


## 2026-11-03 — Phase 4 trace detail drill-down

- Confirmed PR #9 had already been merged into `main` (merge commit `1918f231ea1feb976de87ecf419bb41c9bbb971e`).
- Created `feat/phase-4-trace-detail` from current `main`.
- Extended the telemetry query contract with an optional trace ID filter. The ClickHouse query uses a bound `traceId` parameter against `JSONExtractString(attributes, 'traceId')`.
- Extended the authenticated project spans list route to validate trace IDs (1–256 characters) and pass the filter through without bypassing existing project/environment authorization, time range, and cursor pagination.
- Added a query-adapter unit test and a gated ClickHouse integration test for retrieving spans for one trace.
- Updated the Traces tab with a trace-detail action, paginated detail rows, span IDs/parent indicators, timestamps, messages, and durations.
- No lint, typecheck, unit tests, build, ClickHouse integration, route integration, or browser validation was run. The feature is in an open PR and must not be treated as verified.


## 2026-11-03 — Browser Core Web Vitals implementation

- Confirmed PR #24 merged into `main` (merge commit `0b2e358c3559f47def075ab1ce10489790ccc0de`).
- Created `feat/browser-core-web-vitals` from current `main`.
- Added opt-in `captureWebVitals` to `@jerico/sdk-browser`. It observes TTFB/FCP, LCP, CLS session windows, and estimates INP from interaction duration entries; page-finalized metrics trigger a best-effort flush.
- Browser callers still cannot invoke arbitrary metric submission. Internal browser metric recording uses a five-name allowlist.
- Updated the ingestion Worker to accept public-key metric events only for the exact allowlisted `web.vitals.*` names. Public custom metrics, logs, and spans remain denied.
- Added pure allowlist tests for the browser SDK and ingestion service, plus README, Next.js example, Phase 3/4 roadmap, and handover updates.
- No lint, typecheck, tests, build, browser run, or ClickHouse integration was executed. The native INP/CLS calculations need validation against the official `web-vitals` library and across browser support matrices.


## 2026-11-03 — Core Web Vitals metric dashboard

- Confirmed PR #25 merged into `main` (merge commit `9b11f9d477d9101ebcb17e838f350af4bca95b16`).
- Created `feat/core-web-vitals-dashboard` from current `main`.
- Added standard good/needs-improvement/poor thresholds for LCP, INP, CLS, FCP, and TTFB in the browser SDK. Captured Web Vitals now carry `unit` and `rating` attributes.
- Extended ClickHouse metric buckets with p50, p75, p95, unit, and rating metadata; updated API response mapping and dashboard metric cards.
- Updated unit and gated ClickHouse integration test fixtures/assertions, SDK README, and Phase 3/4 documentation.
- No lint, typecheck, unit tests, build, ClickHouse integration, or browser validation was run. Percentile SQL and actual browser metric distributions still require runtime verification.


## 2026-11-03 — Route-level Core Web Vitals

- Confirmed PR #26 merged into `main` (merge commit `d64b78c30cabc80c57aa4279d7bedfac63c951ae`).
- Created `feat/route-performance-breakdown` from current `main`.
- Added `queryTelemetryRoutePerformance` and authenticated `GET /api/v1/projects/:projectId/telemetry/metrics/routes`. The query is restricted to the five allowlisted Web Vitals names, binds organization/project/environment/time parameters, groups by pathname and metric, and returns sample count, p75, p95, unit, and latest rating, capped at 100 pairs.
- Updated the Metrics tab with per-route Core Web Vitals cards.
- Captured the browser SDK's initial pathname when Web Vitals collection starts so page-finalized metrics remain attributed to the document's initial route.
- Added query-adapter tests, a mocked route-level cross-tenant test, and a gated ClickHouse integration case with route fixtures.
- No lint, typecheck, unit tests, build, ClickHouse integration, or browser validation was run. Route path cardinality and privacy implications are documented.


## 2026-11-03 — Route-template normalization

- Confirmed PR #27 merged into `main` (merge commit `70530ebd3fbe0de8667988595bc44e319cd773af`).
- Created `feat/route-template-normalization` from current `main`.
- Added conservative browser route normalization: UUIDs, long hex identifiers, and long numeric segments become `:id`; query strings and fragments are removed; segment and total path lengths are bounded.
- Added optional `resolveRoute(pathname)` for framework-specific templates. Resolver errors safely fall back to built-in normalization.
- Applied normalized paths to page-view events and the initial Core Web Vitals document attribution.
- Added unit tests and updated browser SDK README, Next.js example, Phase 4 roadmap, and handover.
- No lint, typecheck, tests, build, or browser validation was run.


## 2026-11-03 — Phase 5A uptime monitor management

- Confirmed PR #28 merged into `main` (merge commit `aebb2119db4a97496b1f3b071c47d11371e08d17`).
- Created `feat/phase-5-uptime-monitor-management` from current `main`.
- Added Drizzle schema and migration `0005_uptime_monitors.sql` for project-scoped monitor definitions and check results, including composite tenant/project foreign keys and bounded configuration constraints. Registered the migration in the journal.
- Added strict create/update contracts and API routes for list/create/update/delete plus latest check-history retrieval. Owner/admin role is required for writes; project and organization scope is verified.
- Added a project uptime management page with create/edit/pause/delete and history disclosure; linked it from project cards.
- This is configuration-only: scheduled probes, history writes, state transitions, and incidents are not implemented. SSRF protections and DNS/redirect validation are mandatory before outbound probes are introduced.
- Added contract validation tests and a mocked cross-tenant API test. No migration execution, lint, typecheck, unit tests, build, database integration, or browser validation was run.


## 2026-11-03 — Phase 5B scheduled public uptime probes

- Confirmed PR #29 merged into `main` (merge commit `a731cecc88faaa92492f50851ebd89d2718a61fe`).
- Created `feat/uptime-probe-security` from current `main`.
- Added `apps/worker/src/uptime-probe.ts`: HTTP(S) only, GET/HEAD only, common web ports only, reject IP literals and internal/reserved hostname suffixes, manual redirect handling with max three hops and per-hop revalidation, request timeout, response-body cancellation, and safe error codes only.
- The probe runner uses global Worker `fetch` only; no `cloudflare:sockets` TCP sockets or VPC bindings. Deployment must remain workers.dev-only with public-only egress.
- Added API Cron scheduling and a queue producer. Due monitors are conditionally claimed by advancing `next_check_at` and sent to `jerico-uptime-probes`.
- Added Worker queue consumer, retry handling, and `jerico-uptime-probes-dlq` configuration.
- Added a shared-secret internal result callback with constant-time comparison, strict schema validation, a bounded 4 KiB body, transactional check history insertion, and check-ID idempotency.
- Added unit tests for target validation/redirects, contract tests for internal results, API callback authentication tests, and scheduler missing-binding test. No tests, lint, typecheck, build, migration, Cloudflare provisioning, or deployed probe run was executed.


### Phase 5B follow-up — egress guard and retention

- Enabled Workerd `global_fetch_strictly_public` on the probe Worker and required `PROBE_WORKER_HOST` so the Worker cannot probe itself. No VPC binding or custom route is configured.
- Added a checked-at index and daily 30-day check-history retention.
- Expanded internal result response-time bounds to tolerate scheduler delay.
- Cloudflare queue/secret provisioning and deployed Workerd egress verification remain outstanding.


## 2026-11-03 — Phase 5C alert rules and incident lifecycle

- Started `feat/phase-5-alert-rules-incidents` from current `main`.
- Added `alert_rules` and `incidents` Drizzle schema plus migration `0006_alert_rules_and_incidents.sql` and journal entry.
- Added bounded Zod contracts for error-count, failed-uptime-check, and uptime-response-time alert rules.
- Added project-scoped rule CRUD and incident list/acknowledge/resolve routes. Owner/admin role required for rule management; members can respond to incidents.
- Added a scheduled evaluator invoked every minute. Error counts are queried from ClickHouse; uptime failures and response-time p95 use recent PostgreSQL check history. Missing uptime data does not resolve an active incident. Response-time calculation is bounded to 10,000 recent samples.
- Added active-incident deduplication via a partial unique index; ongoing breaches update the active incident and recovery automatically resolves it.
- Added an Alerts & Incidents project page, linked from dashboard project cards.
- Added contract tests, query adapter tests, pure evaluator helper tests, and mocked API authorization tests. None have been executed; no migration, lint, typecheck, test, build, database integration, Cloudflare runtime, or browser validation has been run.
- Remaining Phase 5 work: notification delivery, escalation, incident assignment/comments/audit history, and end-to-end runtime verification of cron + ClickHouse + PostgreSQL.

## 2026-11-03 — Phase 5D verified email notifications

- Started feat/phase-5-email-notifications from current main.
- Added migration 0007, email notification channel schema, and delivery history with recipient snapshots.
- Added organization owner/admin email channel CRUD, resend verification, and a public verification endpoint. Tokens use 256-bit randomness, SHA-256 hashes at rest, and 24-hour expiry.
- Added incident lifecycle email enqueueing for opened, acknowledged, and resolved events. Delivery records are deduplicated by incident/channel/event.
- Added the Cloudflare notification queue producer/consumer, Resend send request with delivery-ID idempotency key, internal shared-secret result callback, retry handling, and dead-letter queue configuration.
- Added project Alerts & Incidents UI for channel management and recent delivery history, plus a verification page.
- Added notification contract tests, worker queue-message validation tests, and mocked API authorization/callback tests. None have been executed. No dependency install, lint, typecheck, unit tests, build, migration, Resend, Cloudflare queue, or browser validation was run.
- Webhook channels and endpoint verification remain the next notification slice.

## 2026-11-03 — Phase 5D email notifications merged

- PR #32 merged into main (merge commit `40654eecd4c76583d849a741ac497af65e23e54e`).
- Verified email channels, verification flow, notification queue producer/consumer, Resend idempotency key, callback attempt tracking, delivery history, and dashboard controls are now in main.
- Runtime setup still requires migration 0007, notification and DLQ queues, matching callback secret, and Resend credentials on API and Worker. No tests or runtime delivery validation have been executed.

## 2026-11-03 — Phase 5E signed webhook notifications merged

- Resumed from the existing `feat/phase-5-webhook-notifications` branch, which was already based on the then-current `main` and contained an initial API/Worker implementation but no PR.
- Completed webhook incident enqueueing, timestamped HMAC-SHA256 signatures, dashboard channel creation/verification/secret display, one-time AES-GCM secret encryption, bounded public HTTPS endpoint verification/delivery, and queue message validation.
- Added migration `0008_webhook_notification_channels.sql` and Drizzle fields for encrypted signing secrets, verification errors, and a hashed consumed-challenge receipt.
- Hardened verification callback idempotency so a duplicate successful callback does not retry after the one-time challenge has been consumed. Prevented late notification callbacks from downgrading a delivery already marked sent.
- Added contract tests for reserved hostnames, API authorization/validation and duplicate verification callback coverage, AES-GCM encryption tests, Worker queue validation tests, and webhook signature/delivery/URL-guard tests. These tests were authored but not executed.
- Updated Phase 5 and implementation roadmap documentation, plus the current-state handover.
- Opened [PR #33](https://github.com/richard-mante/jerico/pull/33), reviewed the changed files and diff, found no external review comments, and merged it by squash.
- Merge commit: `9d45571e0639d418914b0d0fdbc34e6cf484e321`. Main HEAD was verified at this commit after merge.
- CI run #185 and its retry failed before runner allocation (`runner_id: 0`, no runner name, no steps). This is not a code-test result. No local install, lint, typecheck, unit tests, build, migration, Cloudflare queue, endpoint verification, email delivery, webhook delivery, or browser validation was executed.
- Required deployment setup: apply migration 0008; reuse the existing notification and DLQ queues; set matching API/Worker `WEBHOOK_ENCRYPTION_KEY` (same random 32-byte base64url key); retain the callback secret and Worker's public-only egress configuration.

### Next

- Establish a working local or CI validation environment and run the full workspace checks.
- Apply migrations through 0008 to disposable PostgreSQL and provision non-production Cloudflare/ClickHouse resources.
- Exercise uptime and notification pipelines end-to-end, including webhook challenge verification, HMAC receiver validation, retry/idempotency, and DLQ behavior.
- Then proceed to Phase 6 self-hosting implementation.


## 2026-11-03 — Roadmap validation-status correction

- Rechecked the current `main` tree and found that the implementation roadmap still duplicated Phase 0 acceptance/tasks and incorrectly showed the already implemented Phase 1 core platform as entirely unchecked.
- Corrected Phase 0–3 checkboxes to distinguish implemented code from validation that has not been executed. Phase 1 is now recorded as implemented with PostgreSQL migration and cross-tenant runtime validation still pending.
- Updated the roadmap to state explicitly that the repository has no `pnpm-lock.yaml`, and that the latest CI run #191 and its retry failed before runner allocation (`runner_id: 0`, no runner name, no steps). No source checks are claimed as passing or failing.
- Clarified that request-level ingestion idempotency is implemented, while database/queue verification remains pending; added the self-hosted queue adapter as outstanding work.
- No application code or runtime configuration was changed. No lint, typecheck, tests, build, database migration, or runtime integration test was executed.

### Next
- Resolve GitHub Actions runner allocation or establish a working local runner, then generate and commit the pnpm lockfile and run the full validation suite.
- Continue database, ClickHouse, queue, uptime, and notification runtime validation before self-hosted deployment work.


## 2026-11-03 — Roadmap correction merged; CI allocation remains blocked

- Reviewed and merged documentation PR #34: https://github.com/richard-mante/jerico/pull/34.
- Merge commit: `6bf0a9964f1684ce2f6c873a7c1665d3b0248b73`.
- Verified `main` points to that merge commit and there are no open pull requests.
- CI runs #192 (PR branch) and #193 (post-merge `main`) both failed before runner allocation. Both jobs report `runner_id: 0`, empty runner name, and no steps. Retrying run #191 also failed in the same way.
- Tried to use the available container for local validation; it has Node.js 22.16.0 but cannot resolve `github.com`, so repository cloning and dependency installation cannot proceed from this environment. No source checks ran.
- Removed a duplicate self-hosted queue checklist item from the roadmap; the actual selection/adapter task remains explicitly open.

### Next
- Restore GitHub-hosted runner allocation or provide a reachable local checkout/networked validation environment.
- Generate and commit the missing `pnpm-lock.yaml`, then run install, lint, typecheck, tests, build, and database/ClickHouse integration checks.
- Keep Phase 6 implementation behind the validation gate; queue technology selection should follow a measured adapter spike, not guesswork.


## 2026-11-03 — CI runner allocation rechecked

- Rechecked live main: 6fba375b11dd29df13fd289f18cbdbeee43a3227 (PR #35 merge); no open pull requests.
- Latest push run [#195](https://github.com/richard-mante/jerico/actions/runs/41625755295) and PR run [#194](https://github.com/richard-mante/jerico/actions/runs/41625736379) both failed before workflow steps. The run #195 job is labelled ubuntu-24.04 but reports runner_id: 0, empty runner name, and zero steps.
- Inspected .github/workflows/ci.yml: it uses the standard ubuntu-24.04 hosted runner and has checkout, pnpm 12.7.0, Node 22, install, lint, typecheck, test, ClickHouse integration, and build steps. None of those steps started.
- Confirmed the root package manifest declares pnpm 12.7.0 and the repository still has no committed pnpm-lock.yaml. The lockfile must be generated by a real pnpm install; it must not be fabricated.
- No application code was changed. No install, lint, typecheck, tests, build, database migration, or runtime validation ran.

### Next
- Investigate/restore GitHub-hosted runner allocation in repository/account Actions settings, or use a reachable local runner.
- Once a runner can execute, generate and commit pnpm-lock.yaml, then run the full validation sequence. Keep Phase 6 implementation blocked until validation findings are addressed.


## 2026-11-03 — CI runner investigation and lockfile ownership

- Confirmed PR #36 is merged; current `main` is `ada0632e14441dde3140c273311f85332ebfbd24`. There are no open pull requests.
- Rechecked latest Actions run [#198](https://github.com/richard-mante/jerico/actions/runs/41628640738). Its only job is failed with `runner_id: 0`, no runner name, and `steps: null`; fetching the job log returns `BlobNotFound`. No workflow step ran, so this is not evidence of a source-code test failure.
- The user will generate and commit `pnpm-lock.yaml`. This workstream will not fabricate, generate, or modify the lockfile. Dependency installation and source validation remain pending until the lockfile is present and a runner/networked environment can execute the checks.
- Reviewed the current uptime probe, webhook delivery, Worker queue consumer, and Wrangler configuration at source level. The public-only fetch compatibility flag is present; redirects are disabled for webhook deliveries and manually revalidated for uptime probes. This is a source inspection only, not a runtime SSRF/security certification.
- No application code or runtime configuration was changed. No install, lint, typecheck, tests, build, migration, or live delivery was executed.

### Next
- Continue the source-level security review and document concrete findings before changing security-sensitive code.
- Once the user commits the lockfile and GitHub allocates a runner (or a reachable local environment is available), run the full validation suite and address failures.
- Keep Phase 6 release implementation behind the existing validation gate; do not start Docker/queue adapter implementation without the prerequisite validation and measured adapter decision.


## 2026-11-03 — Continued source-level security review

- Rechecked `main` after PR #37; current main is `3680ed33f26b8f19cd7f4532d36880a1c9c46dcb`.
- Inspected Worker uptime probes and webhook delivery/verification, API internal callbacks and notification channel lifecycle, Drizzle constraints, telemetry ClickHouse query construction, and Better Auth configuration.
- No confirmed exploitable vulnerability was established by source inspection. The Worker still has `global_fetch_strictly_public`; probes revalidate each redirect, webhook delivery rejects redirects, webhook secrets are AES-GCM encrypted at rest, and internal callback bodies are bounded and authenticated.
- Identified remaining validation/review topics rather than changing security-sensitive behavior without executable tests: Workerd egress verification, queue retry/DLQ behavior during callback outages, scheduler/evaluator concurrency, live PostgreSQL tenant isolation, and ClickHouse query timeout/resource limits.
- Corrected the handover's stale latest-merge SHA and removed a duplicated CI-runner sentence. No application code, dependencies, or lockfile changed. No tests/builds/runtime checks were run.


## 2026-11-03 — ClickHouse query and ingestion timeouts

- Reviewed the Worker queue consumers, notification retry handling, uptime scheduler claim path, alert evaluator claim path, and ClickHouse API query adapters.
- Identified that ClickHouse API reads and Worker telemetry writes had no explicit query execution or request timeout.
- Implemented an 8-second ClickHouse `max_execution_time` and a 10-second client request timeout across all eight API query operations and the Worker telemetry insert.
- Added focused assertions in `apps/api/src/telemetry-query.test.ts` and `apps/worker/src/index.test.ts`.
- Opened and merged [PR #39](https://github.com/richard-mante/jerico/pull/39); merge commit: `4d23197e52f95edbf71741b1f8735b7f3b709c13`.
- Confirmed ClickHouse's HTTP interface supports per-request query settings via URL parameters in the official documentation. This does not replace live ClickHouse integration testing.
- Tests were authored but not executed. No lint, typecheck, build, ClickHouse service, or queue runtime validation was run. No lockfile was generated or modified.
- Next review: make notification queue-enqueue failures recoverable (currently recorded as failed without an automatic outbox retry), then verify evaluator overlap behavior and proceed to the blocked runtime validation sequence.


## 2026-11-03 — Notification enqueue retry reconciliation

- Reviewed notification queue enqueue failure handling and confirmed Cloudflare consumer retries/DLQ cannot recover messages rejected before queue acceptance.
- Added `enqueue_attempts` and `next_enqueue_at` to notification deliveries with migration `0009_notification_enqueue_retries.sql` and Drizzle journal/schema updates.
- Added a minute-scheduled reconciliation path for `queue_unavailable` rows. It atomically claims failed rows, uses five total enqueue attempts with exponential backoff (1, 2, 4, 8, 16 minutes), and retains stable delivery IDs.
- Retry reconstruction loads the original channel and incident. Disabled/unverified or missing channels and missing webhook signing material are not re-enqueued. Failure updates are conditional on the delivery still being queued with unchanged attempt counters, protecting callbacks that have already advanced the row.
- Added unit tests for backoff. Tests were not executed.
- Opened and merged [PR #41](https://github.com/richard-mante/jerico/pull/41); merge commit: `eca004ec9034f7275caaf581f26f453937c1c767`.
- CI run #208 failed before runner allocation; job had no steps and its log download returned `BlobNotFound`. No source checks executed. No lockfile was generated or modified.
- Migration 0009 must be applied before deploying this change. Queue/database concurrency and end-to-end delivery still require non-production validation.
- Next review: inspect alert evaluator overlap/claim semantics and ClickHouse query resource limits, then continue the release validation gate.


## 2026-11-03 — Alert evaluation overlap protection

- Investigated Issue #42 and reviewed the alert evaluator, alert-rule schema, existing migration journal, and current tests.
- Added an atomic per-rule lease claim with a unique token and five-minute expiry. The expiry is measured from each rule's actual claim time, not from the start of a potentially long batch evaluation.
- The claim returns the latest rule row; consecutive-count updates are conditional on the same lease token so an evaluator whose lease was reclaimed cannot overwrite newer state. The lease is released conditionally in `finally` across success, no-data, query-error, and unexpected-error paths. Expiry provides recovery after Worker termination.
- Preserved the existing once-per-minute cadence through `last_evaluated_at` while separating it from lease ownership.
- Added Drizzle lease fields, pair constraint, index, migration `0010_alert_evaluation_leases.sql`, and journal entry.
- Added focused helper tests for active/expired lease semantics and consecutive-count progression. These tests were not executed.
- Opened and merged [PR #43](https://github.com/richard-mante/jerico/pull/43); merge commit: `e48c9095f2f15fcca83c5bd2228fd207dd53f288`. Issue #42 was completed by this change.
- CI run [#213](https://github.com/richard-mante/jerico/actions/runs/41640848052) failed before recording workflow steps. No tests, lint, typecheck, build, or migration execution ran. The user will handle manual testing. No lockfile was generated or modified.
- Apply migrations through `0010_alert_evaluation_leases.sql` before deployment.

### Next
- Manually validate concurrent Cron invocations, lease expiry/recovery, query failure release, and consecutive-breach progression.
- Continue the remaining scheduler/tenant-isolation/Workerd egress review and the broader release validation gate.


## 2026-11-03 — Uptime scheduler current-row claim

- Reviewed `apps/api/src/uptime-scheduler.ts` and its existing tests. Found that the scheduler selected full monitor rows, atomically advanced only the due timestamp, but then constructed the queue message from the pre-claim snapshot. A concurrent monitor edit could therefore enqueue stale URL/method/timeout/expected-status settings or use a stale interval.
- Changed discovery to select IDs only. The atomic update now computes the next due time from the current database row's `interval_seconds` and returns the claimed row; the queue payload uses that returned configuration.
- Made failed-enqueue rollback conditional on the exact `next_check_at` timestamp returned by the claim, preventing it from resetting a schedule that was subsequently changed or advanced.
- No migration required. Opened and merged [PR #44](https://github.com/richard-mante/jerico/pull/44); merge commit: `0c4c16ef605eebf7c7b9d200aabdf0606b0103e9`.
- Tests, typecheck, lint, build, and database concurrency checks were not executed. User will handle manual testing. No lockfile was generated or modified.

### Next
- Continue source-level tenant-isolation review, starting with schema-level foreign keys and internal callback/API resource lookups.
- Continue the remaining Workerd egress and queue retry/DLQ review; retain the manual validation and provisioning release gates.


## 2026-11-03 — Notification verification and alert-edit race hardening

- Reviewed the tenant-scoped notification channel resend and public email verification flows. Found a read-then-update race: a verification request could read a valid token, a resend could replace it, and the old request could still mark the channel verified because its final update matched only channel ID and organization.
- Replaced the email verification read/update sequence with a single conditional update matching the exact token hash and unexpired timestamp. A resend that replaces the hash causes an older verification request to update zero rows. Resend and queue-failure updates now also include the organization ID.
- Added route tests for successful atomic token consumption and the invalidated-token outcome. Merged [PR #45](https://github.com/richard-mante/jerico/pull/45); merge commit: `33f0880b94824aefcbd204ec6c1954b2bf9ca5ed`.
- Follow-up review found that editing an alert rule reset its consecutive count but did not revoke an in-flight evaluator lease. An evaluator could therefore finish a query using the previous configuration and commit a stale count/incident decision.
- Alert-rule PATCH now clears the lease token and expiry in the same update as the configuration edit and counter reset. The evaluator's existing token guard fences the old evaluation. Added a route test asserting lease revocation.
- Merged [PR #46](https://github.com/richard-mante/jerico/pull/46); merge commit: `a5f722d981c621b1edef49c015a4f93e8807fa03`.
- Tests, typecheck, lint, build, and database concurrency checks were not executed. The user will handle manual testing. No lockfile was generated or modified.

### Next
- Continue the source-level tenant-isolation and callback lifecycle review, then inspect remaining Worker egress and queue retry/DLQ failure modes.


## 2026-11-03 — Notification channel tenant referential integrity

- Reviewed the tenant-scoped schema and found `notification_channels.organization_id` was the exception among organization-owned resources: it was non-null but had no foreign key to Better Auth's `organization` table.
- Added the organization foreign key with `ON DELETE CASCADE`, mirrored it in the Drizzle schema, and registered migration `0011_notification_channel_organization_fk.sql`.
- Kept the delivery-history behavior unchanged: deleting an individual channel does not cascade-delete its historical delivery rows.
- Opened and merged [PR #47](https://github.com/richard-mante/jerico/pull/47); merge commit: `68a503cd94d0ebfea070fa20b243d767bf988ded`.
- Migration execution and PostgreSQL checks were not run. User will handle manual testing. No lockfile changes.

### Next
- Continue reviewing cross-tenant constraints and internal callbacks; inspect queue retry/DLQ and Worker egress assumptions.
- Apply migrations through `0011_notification_channel_organization_fk.sql` before deployment.


## 2026-11-03 — Notification outbox crash recovery and scheduler wiring

- Reviewed the API scheduled handler against the notification reconciler signature and found a concrete wiring defect: the scheduled handler passed `env` as the database argument, although `retryFailedNotificationEnqueues` expects `(database, env, now)`. This meant the scheduled reconciler did not receive a database and returned without retrying.
- Corrected the Cron handler to open a request-scoped database connection with `withDatabase` and pass the actual database instance.
- Found the process-termination gap in the outbox: rows were inserted as `queued` before the queue send, but a Worker termination before send could leave them queued forever. Added a two-minute enqueue lease and an `enqueued_at` marker to distinguish confirmed queue handoffs from uncompleted handoffs.
- Reconciliation now scans due failed `queue_unavailable` rows and expired queued leases, atomically claims each row, increments the bounded enqueue attempt count, and retains the stable delivery ID. Successful sends and Worker callbacks clear the lease and mark the handoff as observed. Callback attempt counters fence stale failure cleanup.
- Added migration `0012_notification_delivery_enqueued_at.sql`, Drizzle schema/journal updates, and an outbox lease index. Existing queued rows with no lease timestamp are backfilled as already handed to the queue to avoid blindly duplicating every pre-migration delivery; newly created rows use the lease protocol.
- Added a focused helper test for lease duration. Tests, typecheck, lint, build, and PostgreSQL/Queue runtime checks were not executed. The user will handle manual testing. No lockfile was generated or modified.
- Opened and merged [PR #49](https://github.com/richard-mante/jerico/pull/49); merge commit: `42a242e5defbdb0e94f2f05996e3f538671135f8`. Issue #48 closed.
- Apply migrations through `0012_notification_delivery_enqueued_at.sql` before deployment.

### Next
- Continue the remaining queue callback idempotency and Worker egress review, then return to full tenant-isolation review. Keep runtime/manual validation as the release gate.


## 2026-11-03 — Notification callback attempt fencing

- Reviewed the notification callback flow and found that callbacks were keyed only by stable delivery ID. A delayed failure from an older consumer attempt could overwrite the state of a newer attempt, and a duplicate `attempting` callback could increment the attempt count more than once.
- Added a unique enqueue token per outbox handoff and included it in email/webhook queue messages. The Worker now includes the token and Cloudflare Queue's `message.attempts` count in each callback. The API persists the active token and consumer attempt, increments attempts only when the sequence advances, and accepts completion only for the active attempt.
- Duplicate callbacks are idempotent; callbacks from earlier consumer attempts or superseded enqueue tokens are ignored. The API returns an active/inactive signal, and the Worker skips provider work for stale messages. Provider idempotency remains keyed by the stable delivery ID.
- Preserved compatibility for pre-existing queue messages and old callbacks: tokenless callbacks are accepted only for rows with no active enqueue token; an old Worker encountering a token-owned message retries rather than acknowledging it. Worker validation accepts legacy tokenless email/webhook payloads.
- Added migration `0013_notification_delivery_attempt_fencing.sql`, Drizzle schema/journal changes, API route tests, and Worker payload compatibility tests.
- Opened and merged [PR #53](https://github.com/richard-mante/jerico/pull/53); merge commit: `6aab508a960612367c0ff310e166484811151578`. Issue #51 closed.
- Tests, typecheck, lint, build, PostgreSQL, and queue runtime validation were not executed. The user will handle manual testing. No lockfile changes.
- Apply migrations through `0013_notification_delivery_attempt_fencing.sql` before deployment; deploy API and Worker together.

### Next
- Continue the remaining Worker egress and queue DLQ/retention review, then run the manual validation matrix across migrations 0009–0013 and all queue retry paths.


## 2026-11-03 — Cumulative notification attempt count

- Reviewed merged PR #53's callback fencing and found that the API assigned the cumulative `notification_deliveries.attempts` field from Cloudflare's per-message `attemptNumber`. That sequence resets when the API re-enqueues a delivery with a new enqueue token, so the cumulative count could move backwards.
- Changed the accepted `attempting` transition to increment `attempts` atomically with SQL while keeping `activeConsumerAttempt` set to the queue's current per-enqueue attempt number. The existing conditional update still ensures duplicate callbacks do not increment the cumulative counter.
- Added route coverage for a new enqueue generation starting at consumer attempt one.
- Opened and merged [PR #56](https://github.com/richard-mante/jerico/pull/56); merge commit: `1eeb3426fde5266b57ef4594fa3d65679fd1317b`. Issue #55 closed.
- Tests, typecheck, lint, build, and database/queue runtime checks were not executed. The user will handle manual testing. No migration or lockfile changes.

### Next
- Continue the Worker egress, queue DLQ/retention, and remaining tenant-isolation reviews. Keep migration and runtime validation as the release gate.


## 2026-11-03 — Notification and uptime dead-letter finalization

- Reviewed Cloudflare Queue consumer configuration and found that the source notification and uptime queues routed exhausted messages to DLQs, but those DLQs had no configured consumers. Cloudflare documents that DLQs are ordinary queues, require their own consumer, and messages without a consumer are retained only for a limited period.
- Added Worker consumers for `jerico-notifications-dlq` and `jerico-uptime-probes-dlq`, each configured with up to 100 retries for API finalization callbacks.
- Added an authenticated, bounded API callback to mark a matching active notification enqueue as `failed / queue_retry_exhausted`. The update is fenced by enqueue token, treats deleted/superseded rows as stale, and never downgrades a sent delivery.
- Dead-lettered webhook verification messages now record `endpoint_unavailable`; stale/replaced challenges are acknowledged without overwriting current channel state.
- Exhausted uptime probes now submit a terminal `down` result with `network_error`, retaining the original check ID so duplicate DLQ delivery is idempotent and the monitor can progress to down/alert evaluation.
- Kept the telemetry DLQ operator-managed for inspection/replay rather than automatically discarding or replaying failed telemetry.
- Added API/contract tests and a Worker uptime dead-letter result test. Parsed `wrangler.jsonc` successfully during review.
- Opened and merged [PR #58](https://github.com/richard-mante/jerico/pull/58); merge commit: `e76d1892c12f7fc2a74aabc75639bf889098b99b`. Issue #57 closed.
- Tests, typecheck, lint, build, and Cloudflare Queue/PostgreSQL runtime checks were not executed. The user will handle manual testing. No migration or lockfile changes.

### Next
- Continue the remaining cross-tenant authorization, queue retention/replay, and deployed Worker egress reviews. Keep manual runtime validation as the release gate.


## 2026-11-03 — Uptime result fencing

- Reviewed the uptime scheduler and result callback for delayed queue messages and monitor edits. Added `active_check_id` to uptime monitors and migration `0014_uptime_active_check_fencing.sql`.
- The scheduler now creates the check ID before claiming the monitor, persists it in the same atomic claim that advances `next_check_at`, and sends that exact ID to the queue. Queue-send rollback restores the due time and clears the token only if the row still belongs to that claim.
- The API continues to store valid stale results in check history, but only the current active check token can update monitor status. Accepted results clear the token. Monitor edits invalidate in-flight checks; public create/list/update responses omit the internal token. The current status timestamp is kept monotonic if the probe Worker clock is behind.
- Added API and scheduler tests for current/stale/duplicate results, monitor edits, active claim identity, and queue-send rollback.
- Merged [PR #60](https://github.com/richard-mante/jerico/pull/60); merge commit: `db98488928d6f04fc683427697a0720fa14b22d4`. Issue #59 closed.
- GitHub combined status had no reported checks. Tests, typecheck, lint, build, and PostgreSQL/Queue runtime checks were not executed. The user will manually test. Migration 0014 is required; no lockfile changes.

### Next
- Continue the remaining tenant-isolation review and deployed Worker egress/queue retention checks. Manual runtime validation remains the release gate.


## 2026-11-03 — Notification channel deletion fencing

- The tenant-scope review found no confirmed cross-organization API data leak in the reviewed route and schema paths. It did reveal that queued notification payloads carry destination details and could still be delivered after their channel was deleted or disabled.
- Added channel preflight to the notification `attempting` callback. It verifies the delivery's channel exists, is enabled, is verified, and belongs to the delivery's organization. Unavailable channels are marked `failed / channel_unavailable`, the active enqueue token is cleared, and the Worker receives an inactive result and skips provider delivery.
- Channel deletion now runs in a transaction that invalidates failed retries and queued deliveries that have not started, scoped to the same channel and organization. Already in-flight attempts may finish; sent delivery history remains unchanged. Legacy tokenless callbacks cannot revive channel-unavailable rows.
- Added API coverage for active channel attempts, deleted/disabled/unverified channels, legacy tokenless messages, and channel deletion.
- Merged [PR #62](https://github.com/richard-mante/jerico/pull/62); merge commit: `1cd95919aa0c97a11028fac3eeedb26a4ef8ba47`. Issue #61 closed.
- Tests, typecheck, lint, build, and PostgreSQL/Queue runtime checks were not executed. The user will manually test. No migration or lockfile changes.

## 2026-11-03 — ClickHouse read-time deduplication

- Reviewed the ClickHouse telemetry table definition: it is a ReplacingMergeTree keyed by organization, project, environment, timestamp, event type, and stable event ID. Queue delivery is at-least-once; duplicate inserts can remain visible to ordinary SELECT queries until background merges complete.
- Added `FINAL` to all 10 ClickHouse table reads across base event queries, overview, error groups, metric/event series (including nested top-name subqueries), event catalogue, route performance, and alert error counts. Existing query bounds and tenant filters remain intact.
- Added a query-family assertion and duplicate event/error/metric rows to the integration fixture to verify read-time deduplication. Documented the additional read cost for the retained 7/30-day dataset.
- Merged [PR #64](https://github.com/richard-mante/jerico/pull/64); merge commit: `7fc2e42aa3cd5b193b9c30ad16c0f8fcc7afa285`. Issue #63 closed.
- Tests, typecheck, lint, build, and live ClickHouse integration were not executed. The user will manually test. No migration or lockfile changes.

### Next
- Continue source-level review of ingestion credential scoping, deployed Worker egress, and queue retention/replay. Manual runtime validation remains the release gate.


## 2026-11-03 — Ingestion future timestamp bounds

- Reviewed the ingestion credential path and ClickHouse retention behavior. The telemetry table partitions and applies TTL based on client event timestamp; the ingestion schema previously accepted any valid ISO timestamp, including far-future dates. Such rows could remain outside dashboard query windows and extend retention beyond the intended 7/30 days.
- Added a 60-second future-skew bound relative to a single server-generated `acceptedAt` value. The same timestamp is placed in the queue envelope. Historical timestamps remain valid for offline/backfilled events; absent timestamps continue to use the accepted time downstream. Rejection occurs before daily quota reservation and queue publication.
- Added tests for the exact boundary, timestamps beyond it, historical values, missing timestamps, and offset-aware timestamps.
- Merged [PR #66](https://github.com/richard-mante/jerico/pull/66); merge commit: `fdfd55f86e03a9a5fd6af0a48ebe1c9d41b54e67`. Issue #65 closed.
- GitHub combined status had no reported checks. Tests, typecheck, lint, build, and ingestion/ClickHouse runtime checks were not executed. The user will manually test. No migration or lockfile changes.

### Next
- Continue the remaining ingestion idempotency/quota concurrency review and deployed Worker egress/queue retention checks. Manual runtime validation remains the release gate.


## 2026-11-03 — Telemetry event-name redaction

- The ingestion privacy review found that `redactTelemetryEvent` sanitized messages and string-valued attributes but returned client-controlled `event.name` unchanged. An accidental email, bearer token, JWT, or password/token/API-key assignment in a name would therefore persist in ClickHouse and appear in event catalogues.
- Applied the existing deterministic `redactText` patterns to event names, preserving ordinary static names unchanged. Added tests for email plus token assignment, bearer credentials, JWTs, and unchanged static names.
- Merged [PR #68](https://github.com/richard-mante/jerico/pull/68); merge commit: `fbdda443b48ba6563238c810c3454e4644649f14`. Issue #67 closed.
- GitHub combined status had no reported checks. Tests, typecheck, lint, build, and ingestion/ClickHouse runtime checks were not executed. The user will manually test. No migration or lockfile changes.

### Next
- Continue ingestion idempotency/quota concurrency review and deployed Worker egress/queue retention checks. Manual runtime validation remains the release gate.


## 2026-11-12 — ingestion idempotency publication race

- Reviewed the PostgreSQL-backed idempotency and daily-quota reservation flow in `apps/ingest/src/index.ts`.
- Confirmed that a pending idempotency row was read without a row lock, the transaction ended, and queue publication/status update happened afterward. Two concurrent retries could therefore both observe `pending` and publish the same envelope concurrently.
- Updated the idempotent path to lock an existing request row with `SELECT ... FOR UPDATE`, and to hold the reservation transaction open through queue publication and the transition to `accepted`. For a new request, the idempotency row and daily quota reservation are in the same transaction as publication/status transition. Queue-send failure rolls back the database reservation so a later retry can safely try again.
- This serializes concurrent retries for the same credential/key. It does not create a distributed transaction between PostgreSQL and Cloudflare Queues: a process/commit failure after queue acceptance can still result in a later duplicate publication. Stable event IDs and downstream ClickHouse deduplication remain necessary for that at-least-once boundary.
- Branch: `fix/ingest-idempotency-claim-race`. Implementation commit: `69db56ee5d9e501e327e9b9e145a603fc2b67e1c`.
- No tests, typecheck, lint, build, PostgreSQL concurrency test, or Cloudflare Queue runtime test were executed. The change requires review and real database/queue validation before merge.

### Next
- Add a PostgreSQL-backed concurrency regression test proving simultaneous identical retries produce one queue publication.
- Validate transaction/queue failure behavior and lock duration against the deployed PostgreSQL/Hyperdrive and Cloudflare Queue runtime.
- Continue the broader ingestion reliability review: quota boundary behavior, non-idempotent reservation/refund, expired-key cleanup, and queue consumer deduplication.
