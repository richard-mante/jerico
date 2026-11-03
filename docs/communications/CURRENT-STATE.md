# Jerico — Current Project Handover

**Last updated:** 2026-11-03  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Latest feature merge:** PR #33 — `9d45571e0639d418914b0d0fdbc34e6cf484e321`  
**Latest main merge:** PR #37 — `3680ed33f26b8f19cd7f4532d36880a1c9c46dcb`  
**Current milestone:** Phase 5E — signed webhook notifications merged; Phase 0–5 implementation is present, but validation and infrastructure provisioning remain release blockers.

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

Latest milestone: [PR #33 — verified signed webhook notifications](https://github.com/richard-mante/jerico/pull/33). Merge commit: `9d45571e0639d418914b0d0fdbc34e6cf484e321`.

### Phase 5 notification capabilities

- Organization owner/admin email channels with one-time verification.
- Resend email delivery through the existing notification queue.
- Organization owner/admin webhook channels with one-time endpoint challenge verification.
- 256-bit webhook signing secrets encrypted at rest with AES-256-GCM; the raw signing secret is shown only once.
- Timestamped HMAC-SHA256 webhook signatures over the exact request body.
- Incident opened, acknowledged, and resolved delivery events.
- Queue retries, dead-letter routing, bounded internal callbacks, and delivery history.
- Delivery IDs are stable across retries; webhook receivers must deduplicate them.
- The Worker retains `global_fetch_strictly_public`. Do not attach VPC bindings, private egress, or custom-domain routes to the probe/notification Worker.

## Important validation status — not production-ready

**No successful end-to-end validation is confirmed for the repository's Phase 0–5 work.** Tests have been authored, but do not assume they pass.

- CI jobs have repeatedly failed before runner allocation. Latest run #198 (push to main) failed before runner allocation. Its job is configured with the standard ubuntu-24.04 label but reports runner_id: 0, an empty runner name, and no steps. The job has no execution steps or downloadable log; this is an Actions runner allocation/startup failure, not evidence that source checks passed or failed.
- No completed workspace dependency install, lint, typecheck, unit-test run, or full build has been verified.
- No disposable PostgreSQL migration run or Better Auth/tenant integration test has been verified.
- ClickHouse integration tests are gated and have not been observed passing against a real service.
- Cloudflare Hyperdrive, queues, secrets, Cron, Worker delivery, and Workerd SSRF assumptions have not been validated end-to-end.
- No real Resend delivery, webhook challenge, signed delivery, retry/DLQ, or browser workflow has been confirmed.
- No production deployment is verified.

### Required Phase 5 provisioning

Before exercising the notification pipeline in a non-production environment:

1. Apply migrations through `0008_webhook_notification_channels.sql`.
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

1. **Validation foundation:** restore GitHub-hosted runner allocation or establish a reachable local validation environment. The user will generate and commit the missing `pnpm-lock.yaml`; do not fabricate or modify it. Once it is present and a runner is available, install dependencies, run lint/typecheck/tests/build, and fix all findings. Latest run #198 failed before runner allocation (`runner_id: 0`, no runner name, no steps, and no downloadable job log); this is not a source-check result.
2. **Database validation:** verify Drizzle schema/migration consistency; apply migrations to disposable PostgreSQL; test auth, tenant isolation, callback idempotency, and notification channel lifecycle.
3. **Telemetry validation:** run ClickHouse integration tests and verify ingestion/query behavior, deduplication, and retention.
4. **Phase 5 runtime validation:** exercise Cron → uptime queue → public probe → callback → PostgreSQL, and incident → notification queue → email/webhook → callback → delivery history, including retry and DLQ cases.
5. **Security review:** cross-tenant authorization, webhook/uptime SSRF, public-only Worker egress, secret handling, replay protection, redaction, and retention/deletion.
6. **Phase 6 — self-hosted release:** choose and benchmark a durable self-hosted queue adapter, add Docker Compose for web/API/ingest/workers/PostgreSQL/ClickHouse/queue, and validate a fresh Linux install and backup/restore.
7. **Public beta hardening:** accessibility, responsive UX, load/performance, package publishing, licensing, security disclosure, and complete product documentation.

Potential Phase 5 follow-ups include per-event notification preferences, quiet hours, escalation policies, manual retry controls, incident assignment/comments, and an audit timeline. Do not let these delay the essential validation and self-hosting release gates.



### 2026-11-03 source-level review update

Reviewed the current Worker probe/webhook delivery paths, API notification callbacks and channel lifecycle, database constraints, telemetry query construction, and auth setup. No confirmed exploitable issue was established from source inspection alone. In particular, the public-only Worker fetch compatibility flag remains configured, redirect handling is explicit, webhook secrets are AES-GCM encrypted at rest, and internal callbacks use bounded payload parsing plus shared-secret authentication. These are source observations, not deployed SSRF certification or runtime verification. Remaining review/validation items include deployed Workerd egress behavior, retry/DLQ semantics under callback outages, concurrent scheduler/evaluator behavior, tenant isolation against a live PostgreSQL instance, and ClickHouse query timeouts/resource limits.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry.
