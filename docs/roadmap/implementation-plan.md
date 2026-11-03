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

## Phase 0 — Repository foundation
- [ ] Inspect repository, branch, settings, and existing files.
- [ ] Confirm Apache-2.0 license and dependency-license compatibility.
- [ ] Configure pnpm workspace and Turborepo.
- [ ] Configure TypeScript, formatting, linting, and Vitest.
- [ ] Add environment validation and `.env.example`.
- [ ] Add CI for install, lint, typecheck, tests, and builds.
- [ ] Add CONTRIBUTING.md, SECURITY.md, issue templates, and PR template.

**Acceptance:** A clean clone installs and passes documented checks; CI runs on pull requests.

## Phase 1 — Core platform
- [ ] PostgreSQL and Drizzle setup.
- [ ] Authentication and session lifecycle using a maintained auth library.
- [ ] Organizations, memberships, roles, products, projects, and environments.
- [ ] Tenant-scoped repositories and centralized authorization.
- [ ] Hono core API, Zod validation, consistent errors, request IDs, and OpenAPI.
- [ ] Organization, product, project, and environment endpoints.
- [ ] Dashboard onboarding, workspace switcher, project creation, and settings.
- [ ] Cross-tenant access tests.

**Acceptance:** A user can register, create a workspace, create a project, and configure environments without manual database operations.

## Phase 2 — Credentials and telemetry ingestion

**Current milestones:** [Phase 2A — Project Ingestion Credentials](phase-2-credentials.md) and [Phase 2B — Authenticated Telemetry Ingestion](phase-2-ingestion.md) are implemented on the draft PR branch; validation, infrastructure provisioning, and review are pending.
- [ ] Generate project/environment-scoped ingestion keys.
- [ ] Store credential hashes only; show raw key once; support revocation.
- [ ] Separate public ingestion credentials from server-only secrets.
- [x] Define bounded versioned event, error, metric, log, and span contracts.
- [x] Add initial ClickHouse schema, order key, and TTL policy (apply and benchmark pending).
- [ ] Select a durable self-hosted queue and implement a queue adapter.
- [ ] Implement ingestion authentication, validation, redaction, configured rate limits, per-credential daily quotas, and size limits. (Authentication, validation, redaction, request limits, rate-limit hook, and atomic daily event quota implemented; monthly plan tiers remain.)
- [ ] Implement queue consumers, retries, dead-letter handling, and backpressure. (Cloudflare consumer/retry/DLQ config implemented; load/backpressure validation pending.)
- [ ] Add ingestion/processing health metrics and integration tests.

**Acceptance:** Authenticated telemetry is queued and stored; invalid, revoked, and cross-project credentials are rejected. Current code is not production-ready until the database, queue, ClickHouse, and rate-limit resources are provisioned and integration tests pass.

## Phase 3 — TypeScript SDKs
- [ ] Build shared SDK core: batching, transport, bounded retries, flush, sampling, and redaction.
- [ ] Browser SDK: custom events, anonymous/session IDs, identify/reset, navigation, JS errors, unhandled rejections, and Core Web Vitals.
- [ ] Node SDK: custom events, errors, structured logs, custom metrics, explicit flush, and graceful shutdown.
- [ ] Ensure SDK failures never crash the host application.
- [ ] Add Next.js, Astro, React, and Express examples.
- [ ] Add installation, configuration, privacy, redaction, and troubleshooting documentation.

**Acceptance:** Example apps send telemetry to a local deployment and the data is queryable.

## Phase 4 — Observability dashboard
- [ ] Project overview with time range and environment filters.
- [ ] Event explorer, event catalogue, top events, and time-series.
- [ ] Error grouping, stack traces, occurrence history, resolve/ignore actions.
- [ ] Core Web Vitals, route performance, and percentiles.
- [ ] Structured log explorer with severity and time filters.
- [ ] Pagination and query limits on every high-volume view.

**Acceptance:** Developers can investigate submitted telemetry without direct database access; all queries enforce tenant/project authorization.

## Phase 5 — Uptime, alerts, incidents
- [ ] Uptime monitor CRUD, scheduler, probes, history, and state transitions.
- [ ] SSRF protections: block private/loopback/link-local/metadata destinations, validate DNS and redirects, bound response size and redirect count.
- [ ] Alert rules for error rate/count, uptime, and response time.
- [ ] Incident deduplication, acknowledge, and resolve workflows.
- [ ] Email and webhook notifications with verification, retries, and delivery history.

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