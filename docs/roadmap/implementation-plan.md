# Jerico MVP Implementation Roadmap

**Goal:** Ship a standalone observability product first, while building the shared foundation for the wider Founder OS.

## Delivery rules
- Inspect existing files before editing; preserve repository work.
- Work in small, reviewable phases.
- Every feature needs tests, documentation, and acceptance criteria.
- Do not create placeholder screens that imply functionality exists.
- Keep self-hosting viable throughout development.
- Never commit secrets or production telemetry.
- Run lint, type checks, tests, and builds before declaring work complete.

## Validation status — implementation is not verification

The implementation through Phase 5E and the subsequent reliability hardening is present on `main`, but no successful workspace validation or production runtime validation has been confirmed. Checkboxes below distinguish implemented work from work that remains unimplemented; parenthetical notes identify validation gaps.

- GitHub Actions workflow exists, but jobs repeatedly fail before runner allocation (`runner_id: 0`, no runner name, no steps). This is not a passing or failing source test result.
- The repository currently has no `pnpm-lock.yaml`; dependency resolution is therefore not pinned. The user has taken ownership of generating and committing this lockfile; do not fabricate or modify it.
- No successful dependency install, lint, typecheck, unit test, build, disposable PostgreSQL migration, ClickHouse integration, Cloudflare runtime, or browser test has been observed.
- ClickHouse API queries and Worker telemetry inserts now have an 8-second server-side execution limit and a 10-second client request timeout (PR #39); the focused tests and real ClickHouse behavior remain unverified.
- API-side notification queue-send failures now have a scheduled outbox reconciliation path with atomic claims, five total enqueue attempts, and exponential backoff (PR #41; migration `0009_notification_enqueue_retries.sql`). Backoff tests were added but not executed; queue concurrency and end-to-end delivery remain unverified.
- Alert-rule evaluations now use per-rule token-owned leases with five-minute expiry and stale-worker fencing (PR #43; migration `0010_alert_evaluation_leases.sql`). Lease-expiry and consecutive-count helper tests were added but not executed; manual concurrency/runtime validation remains outstanding.
- Uptime scheduling now claims the current monitor row and constructs probe messages from the returned configuration; queue-failure rollback is guarded by the exact claimed schedule timestamp (PR #44). No migration was needed; manual concurrency/runtime validation remains outstanding.
- Email notification verification now atomically consumes the current unexpired token, preventing stale links from winning a resend race (PR #45). Alert-rule edits revoke active evaluation leases so old evaluator snapshots cannot commit after configuration changes (PR #46). Focused route tests were added but not executed.
- Notification channels now reference their owning organization with cascading deletion (PR #47; migration `0011_notification_channel_organization_fk.sql`), preventing orphaned tenant channel rows while preserving individual-channel delivery history.
- Notification enqueue reconciliation now runs with a real database connection and recovers stale queued outbox rows after a two-minute handoff lease expires (PR #49; migration `0012_notification_delivery_enqueued_at.sql`). Stable delivery IDs and bounded attempts are preserved; tests were added but not executed.
- Notification callbacks now carry enqueue tokens and Cloudflare consumer-attempt numbers; API state transitions are fenced to the active enqueue/attempt, making duplicate callbacks idempotent and stale callbacks harmless (PR #53; migration `0013_notification_delivery_attempt_fencing.sql`). API/Worker tests were added but not executed; rolling deployment and queue concurrency remain to be manually validated.
- Notification and uptime DLQs now have consumers: notification deliveries are finalized as failed with enqueue-token fencing, webhook verification dead letters are recorded as unavailable, and uptime dead letters persist a terminal down result. The telemetry DLQ remains operator-managed (PR #58). Tests were added but not executed; Cloudflare Queue runtime and callback-outage retry validation remain outstanding.
- Uptime result callbacks are now fenced by the active scheduled check ID, so delayed probes cannot overwrite a newer claim or monitor edits; queue-send rollback is token-conditional and internal tokens are omitted from public responses (PR #60; migration `0014_uptime_active_check_fencing.sql`). Tests were added but not executed.
- Notification channel deletion invalidates queued and retrying deliveries; Worker preflight skips deleted, disabled, or unverified channels while preserving already in-flight attempts and sent history (PR #62). Tests were added but not executed.
- All telemetry read paths now use ClickHouse `FINAL` against the ReplacingMergeTree table so duplicate queue deliveries are collapsed before aggregation, including nested metric/event series subqueries (PR #64). This adds read-time CPU/memory cost and must be measured with live ClickHouse data; tests were added but not executed.
- Ingestion rejects client timestamps more than 60 seconds ahead of server acceptance time, preventing future-dated rows from bypassing timestamp-based ClickHouse retention and remaining outside dashboard time ranges; historical backfills remain supported (PR #66). Tests were added but not executed.
- The ingestion redaction pipeline now sanitizes client-supplied event names in addition to messages and string-valued attributes, preventing common email/token/password patterns from appearing in event catalogues (PR #68). Tests were added but not executed.
- PR #70 adds OAuth-style token/secret assignment redaction across snake_case, kebab-case, and camelCase keys in telemetry text and string attributes. Tests were added but not executed.
- PR #71 serializes same-key idempotent retries by locking the request row and holding its PostgreSQL reservation transaction through queue publication and the accepted-state update. This closes the concurrent-pending double-publish window; the PostgreSQL/Cloudflare Queue boundary remains at-least-once and still relies on stable event IDs plus downstream deduplication. A PostgreSQL-backed concurrency regression test and runtime validation are still required.
- Durable idempotent ingestion outbox is merged in PR #75: the immutable JSONB envelope and quota reservation commit before queue publication; request retries and the 15-minute Cron reconciler publish pending envelopes under row locks; cleanup deletes only expired accepted rows. This preserves fallback timestamps across queue-accepted/DB-status-commit-failed retries. PostgreSQL failure-injection/concurrency tests and ClickHouse integration verification remain outstanding.
- PR #72 validates Worker telemetry queue envelopes against the shared event contract, including schema version, tenant/project/environment identity, accepted timestamp, event count, event IDs, and event payloads. Invalid messages are acknowledged and discarded; exhausted valid messages route to the configured telemetry DLQ, which remains operator-managed. Tests were added but not executed.
- The durable envelope removes the known idempotent-retry timestamp drift: a retry republishes the stored event IDs and timestamps, keeping duplicates on the same ClickHouse replacement key and partition. Verify this with ClickHouse `FINAL` integration fixtures (including month-boundary timestamps); do not change the sorting key or partitioning without measured evidence.
- The cumulative notification provider-attempt counter now increments atomically on each accepted consumer attempt, independently of the per-enqueue consumer-attempt sequence (PR #56). Focused route coverage was added but not executed.
- PR #103 adds timezone-aware quiet hours per notification channel. Initial delivery, automatic enqueue retries, and manual retries are deferred until the local quiet window ends.
- PR #104 adds configurable escalation delays for unacknowledged incidents, durable escalation activity, and per-channel escalation notifications.
- PR #102 refreshed the product/incident lifecycle handover; the current state is now tracked through PR #104.
- PR #106 records the accepted provider-neutral queue architecture: PostgreSQL-backed queue for self-hosted deployments and Cloudflare Queues for managed hosting.
- PR #108 introduces the shared queue contracts and Cloudflare batch adapter, and adopts the shared contracts in API, ingest, and Worker handlers.
- PR #110 adds the PostgreSQL queue_messages schema/migration and durable adapter: publish, active deduplication, SKIP LOCKED claims, lease fencing, ack/retry/dead-letter, exponential backoff, health, and terminal retention. Migration 0022 is present but has not been executed against PostgreSQL.
- PR #111 adds the portable polling consumer with per-message processing, automatic ack/retry, bounded polling/batch/lease settings, and graceful shutdown.
- PR #112 adds a standalone Node telemetry worker using the PostgreSQL queue and ClickHouse writer, with startup schema validation and localhost-bound health/readiness endpoints. It consumes telemetry only; uptime/notification handlers are deliberately not moved yet because their current outbound SSRF protections depend on Cloudflare public egress.
- Issue #107 tracks the PostgreSQL queue schema/operations, standalone Node worker, adapter parity, Docker Compose, and runtime acceptance criteria.
- The latest known CI runner-allocation failure remains an infrastructure issue, not a source-check result. No successful full workspace validation or production runtime validation is confirmed.

## Phase 0 — Repository foundation
- [x] Inspect repository, branch, settings, and existing files.
- [ ] Confirm Apache-2.0 license and dependency-license compatibility.
- [x] Configure pnpm workspace and Turborepo (install not yet verified).
- [x] Configure TypeScript, formatting, linting, and Vitest (not yet executed).
- [x] Add environment validation and `.env.example`.
- [x] Add CI for install, lint, typecheck, tests, and builds (workflow exists; runner allocation blocked).
- [x] Add CONTRIBUTING.md, SECURITY.md, issue templates, and PR template.
- [ ] Generate and commit `pnpm-lock.yaml` (user-owned; do not fabricate or change it).

**Acceptance:** A clean clone installs reproducibly and passes documented checks; CI runs on pull requests. This acceptance criterion is not yet met.

## Phase 1 — Core platform
- [x] PostgreSQL and Drizzle setup (migration execution still needs validation).
- [x] Authentication and session lifecycle using Better Auth embedded in the Hono API.
- [x] Organizations, memberships, roles, products, projects, and environments.
- [x] Tenant-scoped repositories and centralized authorization (cross-tenant runtime verification pending).
- [x] Hono core API, Zod validation, consistent errors, request IDs, and API routes.
- [x] Organization, product, project, and environment endpoints.
- [x] Dashboard onboarding, workspace switching, project creation, and settings.
- [x] Initial cross-tenant authorization tests authored (not yet executed).

**Acceptance:** A user can register, create a workspace, create a project, and configure environments without manual database operations. Implementation is present; the acceptance flow remains unverified until the app and disposable PostgreSQL environment are run.

## Phase 2 — Credentials and telemetry ingestion

**Current milestones:** [Phase 2A — Project Ingestion Credentials](phase-2-credentials.md) and [Phase 2B — Authenticated Telemetry Ingestion](phase-2-ingestion.md) are merged. Event-level queue-redelivery deduplication is also merged. Validation and infrastructure provisioning remain pending.
- [x] Generate project/environment-scoped ingestion keys (integration validation pending).
- [x] Store credential hashes only; show raw key once; support revocation.
- [x] Separate public ingestion credentials from server-only secrets.
- [x] Define bounded versioned event, error, metric, log, and span contracts.
- [x] Add initial ClickHouse schema, order key, and TTL policy (apply and benchmark pending).
- [x] Implement ingestion authentication, validation, redaction, configured rate limits, per-project daily quotas, and size limits (integration validation pending).
- [x] Implement Cloudflare queue consumers, retries, and dead-letter routing (load/backpressure validation pending).
- [x] Define provider-neutral queue publisher, delivery, batch, consumer, and health contracts; adapt API, ingest, and the Cloudflare Worker to the shared interfaces (PR #108; validation not yet run).
- [x] Implement the PostgreSQL-backed queue schema/adapter and portable polling consumer (PRs #110–#111; migration/runtime validation pending).
- [x] Add a standalone Node worker for telemetry ingestion and ClickHouse writes (PR #112; runtime validation pending).
- [ ] Port uptime and notification consumers with equivalent SSRF-safe outbound networking and terminal dead-letter handling.
- [ ] Add dead-letter inspection/replay, Docker Compose, fresh-install and backup/restore workflows (see [ADR 0001](../architecture/0001-provider-neutral-durable-queue.md) and [issue #107](https://github.com/richard-mante/jerico/issues/107)).
- [ ] Add ingestion/processing health metrics and execute integration tests.

**Acceptance:** Authenticated telemetry is queued and stored; invalid, revoked, and cross-project credentials are rejected. Current code is not production-ready until database, queue, ClickHouse, and rate-limit resources are provisioned and integration tests pass.

## Phase 3 — TypeScript SDKs

See the detailed [Phase 3 SDK plan](phase-3-typescript-sdks.md).
- [x] Shared SDK core: bounded in-memory batching, transport, explicit flush, validation, error reporting, and request-level idempotency for safe batch retries (runtime validation pending).
- [x] Initial browser SDK: public-key enforcement, page views, session identity, identify/reset, JS errors, and unhandled rejections.
- [x] Initial Node SDK: secret-key enforcement, events/errors/logs/metrics/spans, explicit flush/close, and opt-in unhandled-rejection capture.
- [ ] Validate workspace install, lint, typecheck, tests, and builds.
- [ ] Validate request-level ingestion idempotency against PostgreSQL and Cloudflare Queues.
- [ ] Execute SDK host-application safety and integration tests.
- [x] Add opt-in browser Core Web Vitals capture with a server-side allowlist for five public-key performance metrics. Route-change instrumentation and validation against the official `web-vitals` implementation remain open.
- [ ] Add richer Node instrumentation and framework adapters.
- [x] Add Next.js App Router and Express/Node integration examples (documentation only; sample apps not executed).
- [ ] Add installation, privacy, redaction, troubleshooting, package build, and release documentation.

**Acceptance:** Example apps send telemetry to a local deployment and the data is queryable.

## Phase 4 — Observability dashboard
See [Phase 4 query API plan](phase-4-observability.md).
- [x] Tenant-safe query APIs for events, errors, logs, metrics, and spans (implemented; tests and PostgreSQL/ClickHouse integration validation pending).
- [x] Project overview aggregates (implemented; query validation pending).
- [x] First project explorer UI with environment/time filters, overview cards, signal tabs, and pagination (implemented; browser validation pending).
- [x] Event catalogue, top events, and time-series charts.
- [x] Error grouping, latest stack details, persisted open/resolved/ignored status, and paginated occurrence drill-down (assignment, comments, and audit history remain open; incident notifications are implemented in Phase 5D/5E).
- [x] Initial metric time-series charts, per-bucket p50/p75/p95 summaries, browser Core Web Vitals capture with units/ratings, route-level p75/p95 breakdowns, and default/custom route-template normalization. Validation against official field-metric calculations remains open.
- [x] Initial span waterfall and trace detail drill-down (trace-scoped query + paginated spans); service maps and cross-project trace search remain future work.
- [x] Structured log explorer with severity and time filters.

**Acceptance:** Developers can investigate submitted telemetry without direct database access; all queries enforce tenant/project authorization.

## Phase 5 — Uptime, alerts, incidents
See the [Phase 5 uptime plan](phase-5-uptime.md).
- [x] Project-scoped uptime monitor CRUD, check-history storage/API, scheduled queue dispatch, bounded public probes, and idempotent result persistence (Cloudflare provisioning/runtime validation pending).
- [x] Initial SSRF controls: reject IP literals/internal hostnames/unsafe ports, use public-only Worker fetch egress, manually revalidate up to three redirects, bound timeout, and cancel response bodies. DNS/private egress assumptions require deployed Workerd verification; `global_fetch_strictly_public` and an exact self-host block are configured, and the probe Worker must remain workers.dev-only with no VPC binding.
- [x] Project-scoped alert rules for error count, failed uptime checks, and uptime response-time p95; owner/admin configuration, scheduled evaluation, and token-owned evaluation leases with stale-worker fencing (PR #43; migration and manual runtime validation pending).
- [x] Deduplicated incidents with open/acknowledged/resolved lifecycle, manual acknowledge/resolve/reopen, automatic recovery resolution, durable activity history, operational notes, assignment, and repeatable lifecycle notifications (PRs #89–#90 and #101).
- [x] Verified email notification channels, Resend delivery through a Cloudflare Queue, retry/DLQ wiring, and delivery history (provider/runtime validation pending).
- [x] Signed webhook channels with endpoint verification, timestamped HMAC-SHA256 delivery, retries, and delivery history (implementation and tests authored; execution/runtime validation pending).

**Acceptance:** An unavailable test endpoint creates one incident, sends a notification, and resolves after recovery according to configured thresholds.

## Phase 6 — Self-hosted release
- [ ] Docker Compose for web, API, ingest, workers, PostgreSQL, ClickHouse, and queue.
- [ ] Persistent volumes, health checks, secure setup, migrations, and environment validation.
- [ ] Backup/restore test and upgrade instructions.
- [ ] Retention configuration, TLS/reverse proxy guide, and resource sizing guide.
- [ ] Fresh-install validation on a clean Linux server (deferred until implementation is complete).

**Acceptance:** A developer can self-host Jerico and monitor an instrumented application without our hosted infrastructure.

## Phase 7 — Public beta hardening
- [ ] Cross-tenant security and SSRF/abuse review (deferred until implementation is complete).
- [ ] Queue failure/recovery and ClickHouse performance validation (deferred by current implementation-first instruction).
- [ ] Ingestion load and query performance validation (deferred by current implementation-first instruction).
- [ ] Verify retention, deletion, and secret redaction.
- [ ] Accessibility and responsive UI review.
- [ ] License/dependency review, security disclosure process, docs review.
- [ ] Versioned SDK release, changelog, and migration policy.

**MVP release gate:** Onboarding, project setup, browser and Node ingestion, event analytics, error monitoring, performance, uptime, alerts, notifications, retention/deletion, self-hosted install/restore, tenant isolation, and CI must all work.

## Phase 8 — Founder OS expansion
1. GitHub, Vercel, Cloudflare, Paystack, and Stripe integrations.
2. Portfolio and product dashboards.
3. Revenue, expenses, and profitability.
4. Goals, roadmap, and experiment tracking.
5. Evidence-based AI insights.
6. OpenTelemetry Protocol ingestion.
7. Python and mobile SDKs.
8. Community connector ecosystem and managed cloud plans.

## Project management
Track work through Backlog, Ready, In Progress, In Review, Blocked, and Done. Every task must have scope, acceptance criteria, tests, and documentation expectations. Do not mark a phase complete based on generated code alone.


### Durable ingestion outbox review gate
- [x] Persist idempotent envelope and quota reservation before contacting Cloudflare Queues (merged in PR #75).
- [x] Recover pending rows from the existing 15-minute ingest Cron using row locks and `SKIP LOCKED`.
- [x] Exclude pending rows from idempotency expiry cleanup.
- [ ] Add PostgreSQL-backed failure-injection coverage for queue send failure and queue acceptance followed by DB commit failure.
- [ ] Verify concurrent request/Cron publishers, quota-once behavior, and recovery throughput against PostgreSQL/Hyperdrive and Cloudflare Queues.
- [ ] Verify identical event identity/timestamps collapse in ClickHouse `FINAL`, including month-boundary fixtures.
- [x] Update `project_ingestion_keys.last_used_at` for new and matching idempotent requests in PR #76; conflicts and expired keys do not update it.

### Manual notification recovery implementation
- [x] Owner/admin-only manual retry endpoint for failed notification deliveries (PR #80).
- [x] Conditional failed-row claim, fresh enqueue token, verified-channel/incident checks, and queue failure recovery (PR #80).
- [x] Project Alerts & Incidents screen shows delivery history and offers retry for failed deliveries (PR #81).
- [x] Add per-event channel preferences for opened, acknowledged, resolved, and reopened events (PRs #92 and #101).
- [ ] Add quiet hours and escalation policies where they fit the product's initial release.

### Manual uptime operation
- [x] Owner/admin-only one-off check endpoint with active-check fencing and queue failure rollback (PR #83).
- [x] Add Check now control to the uptime monitor dashboard, with queue-configuration awareness (PR #83).

### Current execution direction
- Prioritize functional product implementation and user-facing workflows.
- Defer writing/running tests and all GitHub Actions/builds until the user explicitly asks to resume validation.
- Keep `pnpm-lock.yaml` untouched.
### Additional product functionality
- [x] Edit alert rule configuration from the project dashboard (PR #85).
- [x] Pause and re-enable verified notification channels (PR #86).
- [x] Create and edit project environments, including transactional production designation changes (PR #87).
- [x] Incident ownership, activity timeline, and operator notes (PRs #89–#90).
- [x] Per-event notification preferences, including reopened events (PRs #92 and #101).
- [ ] Quiet-hour configuration and escalation policies.
- [x] Provider-neutral queue contracts and PostgreSQL adapter (PRs #108 and #110); full self-hosted producer/runtime integration remains open.

### Current execution direction
- Prioritize functional product implementation and user-facing workflows.
- Defer writing/running tests and all GitHub Actions/builds until the user explicitly asks to resume validation.
- Keep `pnpm-lock.yaml` untouched.
### Incident operations
- [x] Durable incident activity timeline and operational notes (PR #89).
- [x] Record automated opened/resolved events and manual acknowledge/resolve actions (PR #89).
- [x] Assign incidents to organization members and record assignment history (PR #90).
- [x] Reopen/resolution workflow with repeatable event identities and notifications (PR #101).

### Execution direction
- Continue functional implementation; tests, end-to-end work, and GitHub builds remain deferred until requested.
### Notification and alert operations
- [x] Per-channel preferences for opened, acknowledged, and resolved incident notifications, enforced during initial delivery and retries (PR #92).
- [x] Temporary alert-rule snoozing with 1h, 4h, 24h, and 7d durations (PRs #93–#94).
- [x] Project identity editing and archive/restore, with ingestion blocked for archived projects (PR #95).
- [x] Organization member invitations, role changes, removal, and pending invitation cancellation (PR #96).
- [ ] Complete incident lifecycle controls, including reopen semantics and repeat notification delivery identity.
- [x] Provider-neutral queue contracts and PostgreSQL adapter (PRs #108 and #110); full self-hosted producer/runtime integration remains open.

### Execution direction
- Continue functional implementation; tests, end-to-end work, and GitHub builds remain deferred until requested.

### Product and organization administration
- [x] Product create/edit/archive/restore and project linking (PR #98).
- [x] Owner/admin-only product management controls (PR #99).
- [x] Organization name and slug settings (PR #100).

### Incident lifecycle completion
- [x] Reopen resolved incidents when no other active incident exists for the alert rule (PR #101).
- [x] Persist event keys for repeatable incident lifecycle notifications and retain deduplication for each transition (PR #101).
- [x] Configure per-channel reopened notifications (PR #101).

### Next implementation priority
- [ ] Quiet hours and escalation policies.
- [x] Provider-neutral queue contracts and PostgreSQL adapter (PRs #108 and #110); full self-hosted producer/runtime integration remains open.
- [ ] SDK integration and release experience.

### Execution direction
- Continue functional implementation; defer tests, end-to-end work, and GitHub builds until requested.


### 2026-11-12 — Self-hosted telemetry Compose slice

- [x] PostgreSQL-backed queue storage and portable polling consumer (PRs #110–#111).
- [x] Standalone telemetry-only Node consumer with health/readiness and dead-letter inspection/replay (PR #112).
- [x] Initial PostgreSQL 17 + ClickHouse 25.8 + migration + telemetry-worker Compose slice (PR #116; configuration and runtime validation still pending).
- [ ] Route self-hosted API/ingest producers into PostgreSQL rather than Cloudflare Queues.
- [ ] Port uptime and notification consumers only after equivalent outbound SSRF protections are implemented and reviewed.
- [ ] Complete self-hosted API/dashboard/auth deployment, backup/restore, fresh-install validation, and operational hardening.
