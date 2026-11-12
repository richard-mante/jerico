# Jerico — Current Project Handover

**Last updated:** 2026-11-12  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Latest feature merge:** PR #96 — organization team management (`759066c8c25eabb36a7bb87a4ea23ffc37a1fc86`)  
**Latest main merge:** PR #96 — `759066c8c25eabb36a7bb87a4ea23ffc37a1fc86`  
**Current milestone:** Phase 5E reliability hardening — PRs #70–#72 are merged. The ingest idempotency outbox is durable, credential usage timestamps include idempotent requests, OAuth-style secret assignments are redacted, and Worker telemetry queue envelopes are validated. Manual/runtime validation and infrastructure provisioning remain release blockers.

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
- Better Auth self-hosted inside the Hono API Worker; it is not a separate hosted authentication service.
- Cloudflare Queues for the current managed buffering and notification pipeline.
- Self-hosted deployment remains a core requirement. A durable self-hosted queue/runtime adapter and Docker Compose release are not implemented yet.
- Keep provider-specific services behind narrow adapters where practical. Do not describe the current Cloudflare deployment as self-hosting-ready.

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

Latest merged reliability milestones: [PR #70 — OAuth-style token/secret assignment redaction](https://github.com/richard-mante/jerico/pull/70), [PR #71 — serialize idempotent queue publication](https://github.com/richard-mante/jerico/pull/71), [PR #72 — validate telemetry queue envelopes](https://github.com/richard-mante/jerico/pull/72), [PR #75 — durable telemetry idempotency outbox](https://github.com/richard-mante/jerico/pull/75), and [PR #76 — update credential usage for idempotent requests](https://github.com/richard-mante/jerico/pull/76),  [PR #77 — outbox recovery observability](https://github.com/richard-mante/jerico/pull/77), [PR #78 — recovery metric naming](https://github.com/richard-mante/jerico/pull/78), [PR #80 — manual notification retry API](https://github.com/richard-mante/jerico/pull/80), [PR #81 — notification delivery history and retry controls](https://github.com/richard-mante/jerico/pull/81), [PR #83 — manual one-off uptime checks](https://github.com/richard-mante/jerico/pull/83), [PR #85 — alert rule editing](https://github.com/richard-mante/jerico/pull/85), [PR #86 — notification channel controls](https://github.com/richard-mante/jerico/pull/86), and [PR #87 — project environment management](https://github.com/richard-mante/jerico/pull/87), [PR #89 — incident activity and notes](https://github.com/richard-mante/jerico/pull/89), and [PR #90 — incident assignment](https://github.com/richard-mante/jerico/pull/90), [PR #92 — per-event notification preferences](https://github.com/richard-mante/jerico/pull/92), [PR #93 — alert rule snoozing](https://github.com/richard-mante/jerico/pull/93), [PR #94 — snooze duration controls](https://github.com/richard-mante/jerico/pull/94), [PR #95 — project settings and archive state](https://github.com/richard-mante/jerico/pull/95), and [PR #96 — organization team management](https://github.com/richard-mante/jerico/pull/96). Latest main commit: `759066c8c25eabb36a7bb87a4ea23ffc37a1fc86`.

### Phase 5 notification capabilities

- Organization owner/admin email channels with one-time verification.
- Resend email delivery through the existing notification queue.
- Organization owner/admin webhook channels with one-time endpoint challenge verification.
- 256-bit webhook signing secrets encrypted at rest with AES-256-GCM; the raw signing secret is shown only once.
- Timestamped HMAC-SHA256 webhook signatures over the exact request body.
- Incident opened, acknowledged, and resolved delivery events.
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

1. **Durable ingestion outbox:** PR #75 is merged. The immutable envelope and daily quota reservation commit before queue publication; request retries and the scheduled reconciler publish the stored envelope under a row lock. Pending rows are excluded from expiry cleanup. PostgreSQL-backed failure-injection/concurrency tests and real Cron/Queue validation remain outstanding.
2. **ClickHouse event identity and deduplication:** the durable envelope preserves the original `acceptedAt`, event IDs, and any client timestamps across ambiguous queue/DB outcomes. This should keep retry rows on the same ReplacingMergeTree sorting key and partition. Verify this with ClickHouse integration tests, including a month-boundary retry fixture, before considering any table-key or partitioning change.  
3. **Validation foundation:** restore GitHub-hosted runner allocation or establish a reachable local validation environment. The user will generate and commit the missing `pnpm-lock.yaml`; do not fabricate or modify it. Once it is present and a runner is available, install dependencies, run lint/typecheck/tests/build, and fix all findings. Latest run #213 failed before workflow steps were recorded; this is not a source-check result.
4. **Database validation:** verify Drizzle schema/migration consistency; apply migrations to disposable PostgreSQL; test auth, tenant isolation, callback idempotency, and notification channel lifecycle.
5. **Telemetry validation:** run ClickHouse integration tests and verify ingestion/query behavior, deduplication, and retention.
6. **Phase 5 runtime validation:** exercise Cron → uptime queue → public probe → callback → PostgreSQL, and incident → notification queue → email/webhook → callback → delivery history, including retry and DLQ cases.
7. **Security review:** cross-tenant authorization, webhook/uptime SSRF, public-only Worker egress, secret handling, replay protection, redaction, and retention/deletion.
8. **Phase 6 — self-hosted release:** choose and benchmark a durable self-hosted queue adapter, add Docker Compose for web/API/ingest/workers/PostgreSQL/ClickHouse/queue, and validate a fresh Linux install and backup/restore.
9. **Public beta hardening:** accessibility, responsive UX, load/performance, package publishing, licensing, security disclosure, and complete product documentation.

Potential Phase 5 follow-ups include per-event notification preferences, quiet hours, escalation policies, incident assignment/comments, and an audit timeline. Manual retry controls are now implemented in PRs #80–#81. Do not let these delay the essential validation and self-hosting release gates.



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
- Continue closing user-facing functionality: incident lifecycle controls, team and project administration, and complete the environment/key workflow. Per-event notification preferences and project archive/restore are implemented.
- Complete the self-hosted runtime path: replace direct Cloudflare Queue assumptions with a provider-neutral durable queue adapter, then add the self-hosted services and deployment experience.
- Keep `pnpm-lock.yaml` untouched. Do not run GitHub Actions or builds until the user asks to resume validation.
