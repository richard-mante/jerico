# Jerico — Current Project Handover

**Last updated:** 2026-11-03  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Latest feature merge:** PR #47 — `68a503cd94d0ebfea070fa20b243d767bf988ded`  
**Latest main merge:** PR #47 — `68a503cd94d0ebfea070fa20b243d767bf988ded`  
**Current milestone:** Phase 5E — signed webhook notifications merged, with alert-evaluation concurrency and uptime-scheduler claim hardening merged; implementation is present, but manual/runtime validation and infrastructure provisioning remain release blockers.

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
| Phase 5 reliability hardening — ClickHouse bounds, notification enqueue retries, alert-evaluation leases, current-row uptime scheduling | #39, #41, #43, #44 | Merged |

Latest reliability milestone: [PR #47 — enforce notification channel tenant ownership](https://github.com/richard-mante/jerico/pull/47). Merge commit: `68a503cd94d0ebfea070fa20b243d767bf988ded`.

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

1. Apply migrations through `0011_notification_channel_organization_fk.sql` (includes notification enqueue retry migration 0009 and alert evaluation lease migration 0010).
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

1. **Validation foundation:** restore GitHub-hosted runner allocation or establish a reachable local validation environment. The user will generate and commit the missing `pnpm-lock.yaml`; do not fabricate or modify it. Once it is present and a runner is available, install dependencies, run lint/typecheck/tests/build, and fix all findings. Latest run #213 failed before workflow steps were recorded; this is not a source-check result.
2. **Database validation:** verify Drizzle schema/migration consistency; apply migrations to disposable PostgreSQL; test auth, tenant isolation, callback idempotency, and notification channel lifecycle.
3. **Telemetry validation:** run ClickHouse integration tests and verify ingestion/query behavior, deduplication, and retention.
4. **Phase 5 runtime validation:** exercise Cron → uptime queue → public probe → callback → PostgreSQL, and incident → notification queue → email/webhook → callback → delivery history, including retry and DLQ cases.
5. **Security review:** cross-tenant authorization, webhook/uptime SSRF, public-only Worker egress, secret handling, replay protection, redaction, and retention/deletion.
6. **Phase 6 — self-hosted release:** choose and benchmark a durable self-hosted queue adapter, add Docker Compose for web/API/ingest/workers/PostgreSQL/ClickHouse/queue, and validate a fresh Linux install and backup/restore.
7. **Public beta hardening:** accessibility, responsive UX, load/performance, package publishing, licensing, security disclosure, and complete product documentation.

Potential Phase 5 follow-ups include per-event notification preferences, quiet hours, escalation policies, manual retry controls, incident assignment/comments, and an audit timeline. Do not let these delay the essential validation and self-hosting release gates.



### 2026-11-03 notification enqueue reconciliation

Merged PR #41. Notification deliveries now persist enqueue-attempt count and next retry time. The API minute scheduler retries queue-send failures using atomic failed-to-queued claims, a bounded five-attempt policy, and exponential backoff. Disabled/unverified channels and missing webhook signing material are not re-enqueued. Stable delivery IDs are retained. Migration `0009_notification_enqueue_retries.sql` is required before deployment. Unit coverage for backoff was added but not executed; queue/database concurrency and delivery behavior remain unverified at runtime.

### 2026-11-03 source-level review update

Reviewed the current Worker probe/webhook delivery paths, API notification callbacks and channel lifecycle, database constraints, telemetry query construction, and auth setup. No confirmed exploitable issue was established from source inspection alone. In particular, the public-only Worker fetch compatibility flag remains configured, redirect handling is explicit, webhook secrets are AES-GCM encrypted at rest, and internal callbacks use bounded payload parsing plus shared-secret authentication. These are source observations, not deployed SSRF certification or runtime verification. Remaining review/validation items include deployed Workerd egress behavior, retry/DLQ semantics under callback outages, tenant isolation against a live PostgreSQL instance, and ClickHouse query timeout/resource-limit behavior.

### 2026-11-03 ClickHouse request-bound update

Merged PR #39. All API telemetry query operations now apply ClickHouse `max_execution_time=8` and a 10-second client request timeout. Worker telemetry inserts use the same server-side execution bound and a 10-second client request timeout. Focused tests assert the configured limits. This is an implementation-level safeguard only: tests were authored but not executed, and ClickHouse integration/runtime behavior remains unverified.

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
