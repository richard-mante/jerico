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
- The latest CI run checked for PR #43 is [#213](https://github.com/richard-mante/jerico/actions/runs/41640848052). Its job failed before recording workflow steps; no source checks executed, so this is not a source-check result.

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
- [ ] Select and implement a durable self-hosted queue adapter.
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
- [x] Deduplicated incidents with open/acknowledged/resolved lifecycle, manual acknowledge/resolve, and automatic recovery resolution (notification delivery is implemented in Phase 5D/5E; incident audit history remains open).
- [x] Verified email notification channels, Resend delivery through a Cloudflare Queue, retry/DLQ wiring, and delivery history (provider/runtime validation pending).
- [x] Signed webhook channels with endpoint verification, timestamped HMAC-SHA256 delivery, retries, and delivery history (implementation and tests authored; execution/runtime validation pending).

**Acceptance:** An unavailable test endpoint creates one incident, sends a notification, and resolves after recovery according to configured thresholds.

## Phase 6 — Self-hosted release
- [ ] Docker Compose for web, API, ingest, workers, PostgreSQL, ClickHouse, and queue.
- [ ] Persistent volumes, health checks, secure setup, migrations, and environment validation.
- [ ] Backup/restore test and upgrade instructions.
- [ ] Retention configuration, TLS/reverse proxy guide, and resource sizing guide.
- [ ] Fresh-install end-to-end test on a clean Linux server.

**Acceptance:** A developer can self-host Jerico and monitor an instrumented application without our hosted infrastructure.

## Phase 7 — Public beta hardening
- [ ] Cross-tenant security review and SSRF/abuse testing.
- [ ] Queue failure/recovery and ClickHouse performance tests.
- [ ] Ingestion load tests and query performance tests.
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
