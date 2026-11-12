# Jerico — Current Project Handover

**Last updated:** 2026-11-12  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Latest feature merge:** PR #134 — Compose container hardening (`531d7924fadf0d88fbef53e6ed5c74ced347281d`)  
**Latest main merge:** PR #134 — `531d7924fadf0d88fbef53e6ed5c74ced347281d`  
**Current milestone:** The self-hosted Compose stack now includes the Next.js dashboard, Node management and ingestion APIs, PostgreSQL, ClickHouse, telemetry/uptime/notification workers, and Caddy automatic HTTPS. Backup/restore scripts now cover PostgreSQL and ClickHouse with checksums, an explicit destructive-restore gate, and optional age encryption. The Compose web dependency syntax was corrected in PR #127. The Linux deployment preflight, baseline sizing guidance, opt-in local backup retention, non-root Node/web images, and reduced-capability app containers are now present. Restore drills, fresh-install validation, off-site backup storage/retention, measured resource sizing, and runtime verification remain outstanding.

> Read this file first, then the decision log, session log, architecture, and roadmap. This handover is a summary, not a substitute for inspecting the current code and PRs.

## Product direction

Jerico is an extensible, open-source Founder Operating System. Jerico Observability is the first independently useful product. It must support managed cloud and self-hosted deployments, monitor Jerico itself, and allow external developers to instrument and monitor their applications. Founder OS financial intelligence and business analysis are later phases.

## Confirmed architecture

- pnpm + Turborepo monorepo.
- Next.js + React + TypeScript web dashboard.
- Tauri 2 + Vite + React + TypeScript desktop direction.
- Hono APIs, initially deployed to Cloudflare Workers.
- PostgreSQL + Drizzle for identity, configuration, and transactional data.
- ClickHouse for telemetry analytics.
- Better Auth runs within the Hono API application in both the managed Cloudflare Worker and the self-hosted Node API; it is not a separate hosted authentication service.
- Cloudflare Queues for the current managed buffering and notification pipeline.
- Self-hosted deployment remains a core requirement. Shared queue ports (PR #108), PostgreSQL queue engine (PR #110), polling consumer (PR #111), telemetry worker/DLQ administration (PR #112), Compose infrastructure (PR #116), Node ingestion API (PR #118), Node management API and DNS-pinned multi-queue consumers (PR #120), Next.js dashboard container (PR #122), Caddy automatic HTTPS (PR #123), and PostgreSQL/ClickHouse backup/restore scripts (PR #124) are implemented. Managed Cloudflare deployments remain unchanged. Restore drills, fresh-install validation, production hardening, and runtime verification remain outstanding.
- The accepted queue architecture is documented in [ADR 0001](../architecture/0001-provider-neutral-durable-queue.md). Track remaining work in [issue #107](https://github.com/richard-mante/jerico/issues/107). The managed Cloudflare runtime remains active and unchanged; the self-hosted Compose path is an initial deployment slice, not yet a production-validated release.

## Merged implementation

All implementation PRs through Phase 5E are merged into `main`:

| Milestone | PR | Result |
|---|---:|---|
| Phase 0 — repository foundation | #1 | Merged |
| Phase 1 — identity and tenancy | #2 | Merged |
| Phase 2 — credentials and ingestion | #3 | Merged |
| Phase 3 — TypeScript SDK foundation | #4 onward | Merged |
| Phase 4 — observability APIs and dashboard | #9–#28 | Merged |
| Phase 5A — uptime monitor management | #29 | Merged |
| Phase 5B — secure scheduled uptime probes | #30 | Merged |
| Phase 5C — alert rules and incidents | #31 | Merged |
| Phase 5D — verified email notifications | #32 | Merged |
| Phase 5E — signed webhook notifications | #33 | Merged |
| Phase 5 reliability hardening — ClickHouse bounds, notification enqueue retries, alert-evaluation leases, uptime scheduling, outbox/callback fencing, DLQ finalization, stale uptime result fencing, notification channel deletion fencing, ClickHouse read-time deduplication, future ingestion timestamp bounds, event-name redaction | #39, #41, #43–#44, #49, #53, #56, #58, #60, #62, #64, #66, #68 | Merged |

Latest merged reliability milestones: [PR #70 — OAuth-style token/secret assignment redaction](https://github.com/richard-mante/jerico/pull/70), [PR #71 — serialize idempotent queue publication](https://github.com/richard-mante/jerico/pull/71), [PR #72 — validate telemetry queue envelopes](https://github.com/richard-mante/jerico/pull/72), [PR #75 — durable telemetry idempotency outbox](https://github.com/richard-mante/jerico/pull/75), and [PR #76 — update credential usage for idempotent requests](https://github.com/richard-mante/jerico/pull/76),  [PR #77 — outbox recovery observability](https://github.com/richard-mante/jerico/pull/77), [PR #78 — recovery metric naming](https://github.com/richard-mante/jerico/pull/78), [PR #80 — manual notification retry API](https://github.com/richard-mante/jerico/pull/80), [PR #81 — notification delivery history and retry controls](https://github.com/richard-mante/jerico/pull/81), [PR #83 — manual one-off uptime checks](https://github.com/richard-mante/jerico/pull/83), [PR #85 — alert rule editing](https://github.com/richard-mante/jerico/pull/85), [PR #86 — notification channel controls](https://github.com/richard-mante/jerico/pull/86), and [PR #87 — project environment management](https://github.com/richard-mante/jerico/pull/87), [PR #89 — incident activity and notes](https://github.com/richard-mante/jerico/pull/89), and [PR #90 — incident assignment](https://github.com/richard-mante/jerico/pull/90), [PR #92 — per-event notification preferences](https://github.com/richard-mante/jerico/pull/92), [PR #93 — alert rule snoozing](https://github.com/richard-mante/jerico/pull/93), [PR #94 — snooze duration controls](https://github.com/richard-mante/jerico/pull/94), [PR #95 — project settings and archive state](https://github.com/richard-mante/jerico/pull/95), and [PR #96 — organization team management](https://github.com/richard-mante/jerico/pull/96), [PR #98 — product management](https://github.com/richard-mante/jerico/pull/98), [PR #99 — product permission controls](https://github.com/richard-mante/jerico/pull/99), [PR #100 — organization profile settings](https://github.com/richard-mante/jerico/pull/100), and [PR #101 — incident reopen and repeatable notifications](https://github.com/richard-mante/jerico/pull/101), [PR #103 — timezone-aware notification quiet hours](https://github.com/richard-mante/jerico/pull/103), and [PR #104 — unacknowledged incident escalation](https://github.com/richard-mante/jerico/pull/104), [PR #105 — current-state handover refresh](https://github.com/richard-mante/jerico/pull/105), [PR #106 — provider-neutral queue architecture decision](https://github.com/richard-mante/jerico/pull/106), and [PR #108 — shared queue contracts and Cloudflare adapter](https://github.com/richard-mante/jerico/pull/108), [PR #110 — PostgreSQL queue engine](https://github.com/richard-mante/jerico/pull/110), [PR #111 — portable polling consumer](https://github.com/richard-mante/jerico/pull/111), and [PR #112 — self-hosted telemetry worker](https://github.com/richard-mante/jerico/pull/112). Latest main commit: `e7228b16ec28bfd1bed1c4938b12b8e6746fe7ee`.

### Phase 5 notification capabilities

- Organization owner/admin email channels with one-time verification.
- Resend email delivery through the existing notification queue.
- Organization owner/admin webhook channels with one-time endpoint challenge verification.
- 256-bit webhook signing secrets encrypted at rest with AES-256-GCM; the raw signing secret is shown only once.
- Timestamped HMAC-SHA256 webhook signatures over the exact request body.
- Incident opened, acknowledged, resolved, reopened, and escalated delivery events, with per-channel event preferences.
- Per-channel timezone-aware quiet hours defer initial notification delivery, automatic enqueue retries, and manual retries until the configured quiet window ends (PR #103).
- Alert rules can escalate unacknowledged incidents after configurable delays; escalation is recorded in the incident activity timeline and can trigger channel notifications (PR #104).
- Cloudflare Queue consumer retries and dead-letter routing, plus API-side enqueue reconciliation with bounded exponential backoff (PR #41), bounded internal callbacks, and delivery history.
- Delivery IDs are stable across retries; webhook receivers must deduplicate them.
- The Worker retains `global_fetch_strictly_public`. Do not attach VPC bindings, private egress, or custom-domain routes to the probe/notification Worker.

## Important validation status — not production-ready

**No successful end-to-end validation is confirmed for the repository's Phase 0–5 work.** Tests have been authored, but do not assume they pass.

- CI jobs have repeatedly failed before runner allocation. Latest run #213 (PR #43) failed before workflow steps were recorded. Its job is configured with the standard ubuntu-24.04 label but reports runner_id: 0, an empty runner name, and no steps. The job has no execution steps or downloadable log; this is an Actions runner allocation/startup failure, not evidence that source checks passed or failed.
- No completed workspace dependency install, lint, typecheck, unit-test run, or full build has been verified.
- No disposable PostgreSQL migration run or Better Auth/tenant integration test has been verified.
- ClickHouse integration tests are gated and have not been observed passing against a real service.
- Cloudflare Hyperdrive, queues, secrets, Cron, Worker delivery, and Workerd SSRF assumptions have not been validated end-to-end.
- No real Resend delivery, webhook challenge, signed delivery, retry/DLQ, or browser workflow has been confirmed.
- No production deployment is verified.

### Required Phase 5 provisioning

Before exercising the notification pipeline in a non-production environment:

1. Apply migrations through `0014_uptime_active_check_fencing.sql` (includes notification enqueue retry migration 0009, alert evaluation lease migration 0010, channel organization FK migration 0011, and outbox lease migration 0012).
2. Provision `jerico-uptime-probes`, `jerico-uptime-probes-dlq`, `jerico-notifications`, and `jerico-notifications-dlq`.
3. Configure matching `UPTIME_RESULTS_SECRET` on API and Worker.
4. Configure matching `NOTIFICATION_DELIVERY_SECRET` on API and Worker.
5. Configure `WEBHOOK_ENCRYPTION_KEY` on API and Worker using the same random 32-byte key encoded as unpadded base64url.
6. Configure `RESEND_API_KEY` and `EMAIL_FROM` on API and Worker.
7. Configure Worker `API_URL` to the HTTPS API workers.dev URL.
8. Configure `PROBE_WORKER_HOST` to the exact Worker hostname.
9. Provision API Hyperdrive and ClickHouse, then deploy and test the complete pipeline.

Do not store any of these secrets in the repository. Use deployment secret stores.

## Outstanding work and next sequence

1. **Ingestion reliability validation:** PR #75 is merged. The immutable envelope and daily quota reservation commit before queue publication; request retries and the 15-minute reconciler republish the stored envelope under row locks. Pending rows are excluded from expiry cleanup. The remaining work is PostgreSQL failure-injection/concurrency coverage, quota-once verification, and real Cron/Queue validation.
2. **ClickHouse identity verification:** the durable envelope preserves the original `acceptedAt`, event IDs, and client timestamps across ambiguous queue/DB outcomes, so retries of the same idempotency key retain the same ReplacingMergeTree key and partition. Verify identical delivery collapse with ClickHouse integration fixtures, including timestamps near a month boundary. Do not redesign partitioning unless measurements show a remaining issue.
3. **Validation foundation:** restore GitHub-hosted runner allocation or establish a reachable local validation environment. The user will generate and commit the missing `pnpm-lock.yaml`; do not fabricate or modify it. Once it is present and a runner is available, install dependencies, run lint/typecheck/tests/build, and fix all findings. Latest run #213 failed before workflow steps were recorded; this is not a source-check result.
4. **Database validation:** verify Drizzle schema/migration consistency; apply migrations to disposable PostgreSQL; test auth, tenant isolation, callback idempotency, and notification channel lifecycle.
5. **Telemetry validation:** run ClickHouse integration tests and verify ingestion/query behavior, deduplication, and retention.
6. **Phase 5 runtime validation:** exercise Cron → uptime queue → public probe → callback → PostgreSQL, and incident → notification queue → email/webhook → callback → delivery history, including retry and DLQ cases.
7. **Security review:** cross-tenant authorization, webhook/uptime SSRF, public-only Worker egress, secret handling, replay protection, redaction, and retention/deletion.
8. **Phase 6 — self-hosted release:** complete Node queue handlers for uptime and notifications with equivalent SSRF-safe outbound networking, add dead-letter inspection/replay, Docker Compose for web/API/ingest/workers/PostgreSQL/ClickHouse, and validate a fresh Linux install plus backup/restore. The telemetry-only queue worker and PostgreSQL queue engine are already implemented but not runtime-validated.
9. **Public beta hardening:** accessibility, responsive UX, load/performance, package publishing, licensing, security disclosure, and complete product documentation.

Per-event notification preferences, timezone-aware quiet hours, escalation policies, incident assignment/comments, incident reopening, and manual retry controls are implemented. The self-hosted API, ingestion, dashboard, Caddy TLS routing, and PostgreSQL/ClickHouse backup/restore scripts are now present. The next milestone is validating a clean Linux install, performing a real restore drill, hardening secrets/networking/resource sizing, and closing outstanding runtime/security checks. Do not describe the self-hosted deployment as production-ready until those gates pass.



### 2026-11-03 notification enqueue reconciliation

Merged PR #41. Notification deliveries now persist enqueue-attempt count and next retry time. The API minute scheduler retries queue-send failures using atomic failed-to-queued claims, a bounded five-attempt policy, and exponential backoff. Disabled/unverified channels and missing webhook signing material are not re-enqueued. Stable delivery IDs are retained. Migration `0009_notification_enqueue_retries.sql` is required before deployment. Unit coverage for backoff was added but not executed; queue/database concurrency and delivery behavior remain unverified at runtime.

### 2026-11-03 source-level review update

Reviewed the current Worker probe/webhook delivery paths, API notification callbacks and channel lifecycle, database constraints, telemetry query construction, and auth setup. No confirmed exploitable issue was established from source inspection alone. In particular, the public-only Worker fetch compatibility flag remains configured, redirect handling is explicit, webhook secrets are AES-GCM encrypted at rest, and internal callbacks use bounded payload parsing plus shared-secret authentication. These are source observations, not deployed SSRF certification or runtime verification. Remaining review/validation items include deployed Workerd egress behavior, retry/DLQ semantics under callback outages, tenant isolation against a live PostgreSQL instance, and ClickHouse query timeout/resource-limit behavior.

### 2026-11-03 ClickHouse request-bound update

Merged PR #39. All API telemetry query operations now apply ClickHouse `max_execution_time=8` and a 10-second client request timeout. Worker telemetry inserts use the same server-side execution bound and a 10-second client request timeout. Focused tests assert the configured limits. This is an implementation-level safeguard only: tests were authored but not executed, and ClickHouse integration/runtime behavior remains unverified.

### 2026-11-03 dead-letter queue finalization

Merged PR #58. The Worker now consumes the notification and uptime DLQs. Exhausted notification deliveries are marked failed with `queue_retry_exhausted`, guarded by their active enqueue token and without downgrading sent deliveries. Exhausted webhook verification messages record endpoint-unavailable unless their challenge is stale. Exhausted uptime probes create an idempotent terminal `down` result using the original check ID. DLQ callback failures retry up to 100 times; the telemetry DLQ remains operator-managed for inspection/replay. No migration was needed. Tests were added but not executed; manual Cloudflare Queue and API outage/recovery validation remains outstanding.

### 2026-11-03 cumulative notification attempt counter

Merged PR #56. The API now increments the cumulative `notification_deliveries.attempts` counter atomically when a new consumer attempt is accepted. The separate `active_consumer_attempt` remains scoped to the current enqueue token, so a new enqueue generation can start at consumer attempt one without resetting the cumulative provider-attempt count. Focused route coverage was added but not executed; manual retry validation remains outstanding.

### 2026-11-03 notification callback attempt fencing

Merged PR #53. Every notification queue handoff now carries a unique enqueue token; Worker callbacks also include Cloudflare's per-message attempt count. The API advances attempts only when the callback belongs to the active enqueue and advances the consumer attempt, and only the current attempt can complete/fail the delivery. Duplicate callbacks are idempotent; stale callbacks are ignored. Workers receive an explicit active/inactive result and skip provider work for superseded queue messages. Legacy tokenless queued messages and old callbacks are supported only while the row has no token-owned enqueue. Migration `0013_notification_delivery_attempt_fencing.sql` is required. Tests were added but not executed; manual concurrency and rolling-deploy validation remains outstanding.

### 2026-11-03 notification outbox crash recovery

Merged PR #49. The scheduled handler now opens a database connection and passes it to the notification enqueue reconciler; the previous call passed the environment in the database position, so retries could not run. New queue handoffs carry a two-minute lease and an `enqueued_at` marker. Reconciliation can recover stale queued rows whose handoff was interrupted, plus failed queue-unavailable rows, using atomic claims, bounded attempts, and stable delivery IDs. Worker callbacks clear the lease and mark the queue handoff as observed. Migration `0012_notification_delivery_enqueued_at.sql` adds the marker and scan index, and backfills legacy queued rows as already handed off to avoid mass duplicate sends. Tests were added but not executed; manual queue/crash/concurrency validation remains outstanding.

### 2026-11-03 notification channel tenant integrity

Merged PR #47. Notification channels now have a database foreign key to their owning organization with `ON DELETE CASCADE`, matching the Drizzle schema. This prevents orphaned channel records and ensures organization deletion cleans them up. Migration `0011_notification_channel_organization_fk.sql` is required. Individual channel deletion continues to preserve notification delivery history.

### 2026-11-03 notification verification and alert edit race fixes

Merged PR #45 and PR #46. Email verification now consumes a matching, unexpired token hash in one conditional database update, preventing a link invalidated by a concurrent resend from verifying the channel. Resend updates are explicitly organization-scoped. Alert-rule edits now clear the current evaluation lease token and expiry along with resetting the consecutive count, fencing out an evaluator still using the old configuration. Focused route tests were added but not executed; manual concurrency validation remains outstanding.

### 2026-11-03 uptime scheduler claim reconciliation

Merged PR #44. The scheduler discovers due monitor IDs only, atomically claims each row, and builds the probe payload from the current row returned by that claim. The next check time is calculated using the interval on the claimed database row, avoiding stale URL/method/timeout/interval values when a monitor is edited concurrently. Failed-enqueue rollback is conditional on the exact claimed schedule timestamp, so it cannot overwrite a newer schedule. No migration was needed. Tests and runtime concurrency checks were not executed; manual validation remains outstanding.

### 2026-11-03 alert evaluation lease hardening

Merged PR #43. Alert rules now use an atomic token-owned evaluation lease with a five-minute expiry, preserving the once-per-minute cadence while preventing a second Cron invocation from claiming an active evaluation. Claims return the current row; consecutive-count writes require the same lease token, fencing off stale workers after lease reclamation. The lease is conditionally released in `finally` for success, no-data, query errors, and unexpected failures; expiry recovers after Worker termination. Migration `0010_alert_evaluation_leases.sql` is required before deployment. Focused helper tests cover lease-expiry semantics and consecutive-count progression but were not executed. GitHub Actions run #213 failed before workflow steps; no source checks ran. Manual/runtime validation remains outstanding.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry.


### 2026-11-03 uptime result fencing

Merged PR #60. Uptime monitors now store the active scheduled check ID. The scheduler persists the token as part of its atomic due-time claim and uses it for the queue message; failed enqueue rollback only clears the matching claim. Result callbacks still write valid results to history, but update current monitor state only when the result matches the active token, then clear it. Monitor edits invalidate in-flight tokens, public monitor responses omit the internal token, and last-checked timestamps remain monotonic. Migration `0014_uptime_active_check_fencing.sql` is required. Scheduler and API route tests were added but not executed; manual PostgreSQL/Queue concurrency validation remains outstanding.


### 2026-11-03 notification channel deletion fencing

Merged PR #62. Before a Worker begins provider delivery, the API checks that the delivery's channel still exists, is enabled, is verified, and belongs to the same organization. Missing/disabled/unverified channels are terminally failed with `channel_unavailable`, and queued messages are fenced by clearing their enqueue token. Channel deletion transactionally invalidates failed retries and queued deliveries that have not started, while preserving already in-flight attempts and sent history. Tokenless legacy callbacks cannot revive channel-unavailable deliveries. API tests were added but not executed; manual queue/delete race validation remains outstanding.

### 2026-11-03 ClickHouse read-time deduplication

Merged PR #64. Every telemetry query family now uses ClickHouse `FINAL` for the ReplacingMergeTree table, including nested series subqueries and alert error counts. This prevents at-least-once queue retries and ambiguous insert outcomes from temporarily inflating dashboard counts before background merges. Unit query-family coverage and duplicate-row ClickHouse integration fixtures were added but not executed. Read-time FINAL increases query cost; verify it against the retained 7/30-day data and existing 8-second server/10-second client limits during manual ClickHouse testing.


### 2026-11-03 ingestion timestamp bounds

Merged PR #66. Ingestion now rejects a telemetry batch if any client-supplied event timestamp is more than 60 seconds ahead of the same server-generated `acceptedAt` written to the queue envelope. Historical timestamps remain accepted for offline/backfilled events; events without timestamps remain server-timestamped downstream. The check runs before daily quota reservation and queue publication. Unit tests cover the boundary, future, historical, absent, and offset-aware timestamps. Tests were added but not executed; manual ingestion/ClickHouse validation remains outstanding. No migration was required.


### 2026-11-03 telemetry event-name redaction

Merged PR #68. Ingestion now applies the existing deterministic text-redaction patterns to event names as well as messages and string-valued attributes. This covers common emails, bearer credentials, JWTs, and password/token/API-key assignments that might otherwise be persisted and exposed through event catalogues. Static event names remain unchanged. Tests were added but not executed; manual ingestion/ClickHouse validation remains outstanding. No migration was required.


### 2026-11-12 — reliability PRs #70–#72

- PR #70 merged OAuth-style secret assignment redaction for snake_case, kebab-case, and camelCase token/secret keys in telemetry text and string attributes.
- PR #71 merged serialization of same-key idempotent ingestion retries by locking the idempotency row through queue publication and the accepted-state update. This narrows the concurrent double-publication race but does not create a distributed transaction between PostgreSQL and Cloudflare Queues.
- PR #72 merged Worker-side validation of telemetry queue envelopes against the shared telemetry event contract, including schema version, tenant/project/environment identity, accepted timestamp, event count, event IDs, and event payloads. Invalid messages are currently acknowledged and discarded; valid messages that exhaust queue retries route to the configured telemetry DLQ, which remains operator-managed and has no Worker consumer configured.
- These PRs add regression tests, but no test, typecheck, lint, build, PostgreSQL integration, or ClickHouse integration run has been verified. The GitHub Actions runner allocation failure remains unresolved; do not treat it as a source-check result.
- Current ClickHouse identity risk: `ReplacingMergeTree` partitions by event timestamp and sorts by tenant/project/environment, timestamp, event type, then event ID. A same-ID retry with a different fallback timestamp can therefore survive `FINAL`; month-boundary timestamp changes also cross partitions. A durable fix is under design and must preserve retention, query pagination, aggregation semantics, and tenant isolation.


### 2026-11-12 — durable telemetry idempotency outbox (PR #75 merged)

- Reworked `apps/ingest/src/index.ts` so an idempotent request's immutable queue envelope and daily quota reservation commit in PostgreSQL before Cloudflare Queue publication begins.
- Queue publication then locks the committed idempotency row, sends its stored envelope, and marks it accepted. If queue acceptance succeeds but the status transaction fails, the row remains pending; the next client retry or scheduled reconciliation republishes the same event IDs, acceptedAt, and fallback timestamps.
- The existing 15-minute ingest Cron now recovers up to 100 pending rows per run using `FOR UPDATE SKIP LOCKED`, then removes only expired accepted rows. Pending records are never deleted by retention cleanup, so queue outages cannot silently erase reserved work.
- No schema or migration change was required; the existing `project_ingestion_requests.envelope` JSONB field and pending/accepted status are reused. Non-idempotent ingestion behavior is unchanged.
- PR #75 merged to `main` as `4e78253ff95db91274cb55c363bcc54029ed67fc`; branch: `fix/durable-telemetry-idempotency-outbox`.
- Review caveat: queue sends and status updates still cannot be a distributed transaction. Recovery is intentionally at-least-once; duplicate sends carry the exact same envelope and must be collapsed by the existing ClickHouse replacement identity.
- No tests, typecheck, lint, build, PostgreSQL, or ClickHouse runtime checks have been executed. The change is merged but not production-validated. `pnpm-lock.yaml` and ClickHouse DDL were not changed.

### Next implementation work (tests/builds deferred)
- Continue closing user-facing functionality: remaining notification quiet-hour/escalation controls, SDK integration and release workflow, then provider-neutral queue and self-hosted runtime. Project/product/team/environment administration and incident lifecycle controls are now implemented.
- Complete the self-hosted runtime path: replace direct Cloudflare Queue assumptions with a provider-neutral durable queue adapter, then add the self-hosted services and deployment experience.
- Keep `pnpm-lock.yaml` untouched. Do not run GitHub Actions or builds until the user asks to resume validation.


### 2026-11-12 — Compose infrastructure slice (PR #116 merged)

- Added `compose.self-hosted.yaml` with PostgreSQL 17, ClickHouse 25.8, one-shot Drizzle migration, and the standalone telemetry queue worker.
- Added a Dockerfile for the queue worker, root `.dockerignore`, URL-safe secret template, and setup/operations guide. Worker host port binds to 127.0.0.1; dead-letter administration uses a required bearer token.
- Added expiry checks to lease-token-fenced ack/retry/dead-letter/extend operations so an expired lease cannot settle a message before a competing worker reclaims it.
- The Compose slice consumes only the PostgreSQL `jerico-telemetry` queue. Current Cloudflare API/ingest producers still publish to Cloudflare Queues, so this is not yet an end-to-end self-hosted product stack.
- PR #116 merged as `572b5c4b21e165a0337c4ae9bbb6af961bcdc192`. The superseded draft PR #115 was closed after its worker changes were found already present on main.
- Docker build, Compose config validation, migration execution, PostgreSQL/ClickHouse runtime, typecheck, lint, and tests have not been run. No validation is claimed. `pnpm-lock.yaml` remains untouched.


### 2026-11-12 — Self-hosted API and worker runtime (PR #120 merged)

- Added `apps/api-node`: runs the existing Hono management API and Better Auth on Node, publishes uptime and notification jobs to PostgreSQL queues, and runs scheduled alert evaluation, uptime scheduling, notification enqueue reconciliation, and daily retention.
- Added Node queue consumers for telemetry, uptime probes, and notifications. Existing Cloudflare worker business logic is reused.
- Added DNS-pinned public outbound transport: resolve A/AAAA records, reject any non-public or mixed public/private DNS result, pin the socket lookup to the validated IP, revalidate uptime redirects individually, and reject webhook redirects. The pinned transport also handles Resend API requests.
- Worker callbacks may use HTTP only when explicitly enabled for the exact private Compose endpoint `api:8787`; managed workers continue to require HTTPS. Callback secrets remain mandatory.
- Compose now starts PostgreSQL, ClickHouse, migrations, Node API, Node ingestion, and the multi-queue worker. Host ports remain bound to loopback.
- Managed Cloudflare API/ingest/worker deployment remains unchanged. The self-hosted stack now includes the web dashboard, Caddy automatic HTTPS, and backup/restore scripts; restore drills, off-site backup encryption/retention, fresh-install validation, and production hardening remain outstanding.
- PR #120 merged as `ab876a7e9ac95c50287a1c5094a8addd381f9b79`.
- No tests, typecheck, lint, build, Docker build, Compose validation, migrations, or live database/SSRF checks were run. No validation is claimed. `pnpm-lock.yaml` was not touched.


### 2026-11-12 — Self-hosted web, TLS, and backup/restore

- Merged PR #122: added a standalone Next.js production Docker image and Compose web dashboard service. The browser API origin is embedded at build time from `API_DOMAIN`.
- Merged PR #123: added Caddy as the public-facing entrypoint for the web dashboard, API, and ingestion service. Caddy automatically provisions HTTPS certificates for configured domains and persists certificate/config state. Only Caddy ports 80/443 (plus UDP 443) are public; app services remain loopback-bound on the host.
- Merged PR #124: added ClickHouse local backup disk configuration, PostgreSQL custom-format backup, ClickHouse native backup archive, SHA-256 manifests, and a destructive restore script guarded by `CONFIRM_DESTRUCTIVE_RESTORE=YES`. Backup/restore pauses writers and drains API/ingest maintenance before closing pools.
- Merged PR #127: corrected malformed `web.depends_on` syntax in Compose so the dashboard waits for the healthy API service; retained the 40-second graceful stop period.
- Merged PR #128: added optional age encryption for both archives. When `AGE_RECIPIENT` is set, plaintext archives are removed before checksums are written. Restore verifies encrypted artifacts, requires `AGE_IDENTITY`, decrypts into a private temporary directory, and cleans it on exit. Existing plaintext backup format remains supported.
- The Caddy `jerico-caddy-data` volume should also be preserved separately. The preflight checks Docker/Compose, secret formats, Compose interpolation, DNS, public ports, and basic CPU/RAM/disk thresholds. It does not certify capacity. A restore drill and fresh-install validation have not been run.
- PR #124 merged as `e7228b16ec28bfd1bed1c4938b12b8e6746fe7ee`; PR #127 as `206a86ec2c82f7ef9f4136032580725a0cd99879`; PR #128 as `44b5bc2cb134559d42d3fbb24542beca3a9e30d1`.
- No tests, typecheck, lint, build, Docker build, Compose validation, migrations, restore drill, or live PostgreSQL/ClickHouse runtime checks were run. No validation is claimed. `pnpm-lock.yaml` remains untouched.
