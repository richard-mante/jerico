# Jerico Implementation Roadmap

**Goal:** Deliver Jerico Observability as the first independently useful product, while preserving the shared foundation for the wider Founder Operating System.

**Last updated:** 2026-11-12

## Execution rules

- Prioritize complete, functional product implementation and user-facing workflows.
- Defer writing/running tests, end-to-end validation, GitHub Actions, and builds until the user explicitly asks to resume validation.
- Do not claim a build, test, migration, backup, restore, or runtime path has passed unless it was actually executed.
- Keep `pnpm-lock.yaml` untouched; the user will generate and commit it locally.
- Keep managed Cloudflare production behavior unchanged while maintaining the provider-neutral self-hosted path.

## Validation status

Implementation has progressed substantially, but **Jerico is not production-validated**.

- No successful full workspace install, lint, typecheck, unit-test run, or build is confirmed.
- No complete Docker image build, Compose parse, fresh Linux installation, database migration, or live PostgreSQL/ClickHouse run is confirmed.
- No encrypted local/off-site backup restore drill is confirmed.
- No production Workerd SSRF, tenant-isolation, queue-recovery, or ClickHouse load validation is confirmed.
- SDK package output and sample integrations have not been built or executed.
- The repository still needs the user-owned `pnpm-lock.yaml`.

## Completed implementation

### Product and observability foundation

- Identity, Better Auth, organizations, memberships, invitations, roles, products, projects, environments, ingestion credentials, and project administration.
- Telemetry ingestion, event analytics, errors, logs, metrics, spans, and query/dashboard workflows.
- Uptime monitor management, scheduled and manual checks, result history, and status tracking.
- Alert rules, snoozing, incident creation, assignment, notes/activity, acknowledgement, resolution, reopening, and repeatable notification identity.
- Email and signed webhook notification channels, verification, delivery history, manual retry, per-event preferences, timezone-aware quiet hours, and escalation policies.

### Ingestion and queue reliability

- Shared queue contracts and Cloudflare adapter.
- PostgreSQL-backed durable queue storage with active-message deduplication, short `SKIP LOCKED` claims, lease-token fencing, retries/backoff, dead-lettering, health counters, and retention.
- Portable polling consumer and self-hosted telemetry/uptime/notification worker.
- Durable ingestion outbox stores the immutable accepted envelope and quota reservation before queue publication; retries/reconciliation reuse the same accepted timestamps and event IDs.
- OAuth/secret redaction and strict telemetry queue-envelope validation.

### Self-hosted deployment

- Node management API and Better Auth runtime.
- Node ingestion API with PostgreSQL queue publishing, per-credential PostgreSQL rate limits, and scheduled idempotency-outbox recovery.
- DNS-validated and pinned outbound networking for uptime probes and webhooks, including redirect revalidation/rejection.
- PostgreSQL, ClickHouse, migration runner, Node API, ingestion service, queue worker, Next.js dashboard, and Caddy HTTPS Compose stack.
- Corrected Compose dashboard/API dependency, non-root Node/web images, Docker init, no-new-privileges, and dropped Linux capabilities for application containers.
- Secure environment bootstrap and deployment preflight, including secret-format, DNS, port, Compose, and basic host-resource checks.
- PostgreSQL/ClickHouse backup and restore scripts with checksums and destructive-restore confirmation.
- Optional age encryption, opt-in local manifest-backed retention, and optional rclone encrypted off-site upload/verification/restore.

### TypeScript SDKs

- Shared SDK core, browser SDK, and Node SDK with bounded in-memory batching, explicit flush/close, public/secret key enforcement, and request-level idempotency.
- Configurable ingestion request timeout; ambiguous failures retain the same idempotency key and batch body for explicit retry.
- Official `web-vitals` measurement for LCP, CLS, INP, FCP, and TTFB with Jerico's public-key metric allowlist.
- Compiled ESM/declaration output configuration and package READMEs.
- Next.js, Express, React/Vite, and Astro integration guides.

All of the above describes merged implementation, **not verified runtime behavior**.

## Remaining implementation and release gates

### 1. Self-hosted release verification

- [x] Add secure first-run `.env` bootstrap and host preflight (PRs #130 and #139).
- [ ] Perform a clean Linux installation using `init-env.sh`, preflight, and Compose.
- [ ] Verify PostgreSQL migrations, API/auth, ingestion, queue publishing/consumption, ClickHouse writes/queries, uptime probes, and notification delivery.
- [x] Add restore manifest timestamp/format/archive/encryption verification before destructive restore (PR #149).
- [x] Add optional daily systemd backup service/timer (PR #150).
- [ ] Execute plaintext and age-encrypted local backup/restore drills.
- [ ] Execute rclone upload, remote verification, and off-host restore against a disposable remote.
- [ ] Configure storage-provider lifecycle/versioning and retention policy; the scripts never delete remote objects.
- [x] Add daily terminal queue cleanup for completed and dead-lettered rows with configurable retention (PR #152).
- [x] Add configurable self-hosted ClickHouse log/event TTL with an idempotent policy application job (PRs #160–#161).
- [x] Enforce provider-neutral queue payload size below the managed Cloudflare 128 KB per-message limit (PR #165).
- [x] Make SDK batches byte-aware so payloads stay within the ingestion request limit (PR #166).
- [x] Quarantine invalid telemetry envelopes rather than acknowledging/discarding them (PR #154; provider DLQ routing still needs runtime verification).
- [ ] Verify graceful shutdown, restart recovery, queue leases, dead-letter replay, and service health behavior.
- [x] Add bounded Docker JSON log rotation to prevent unbounded container log growth (PR #156).
- [x] Add Caddy response security headers and API/ingestion request body limits (PRs #157–#158).
- [x] Allow forced off-site restore refresh when local artifacts are suspected to be corrupted (PR #159).
- [ ] Measure CPU, memory, disk, ClickHouse growth, queue throughput, and query latency under realistic workloads; current sizing values are starting guidance only.

### 2. Security and operational review

- [ ] Review cross-tenant authorization and organization/project/environment boundaries against a live database.
- [ ] Verify public-only egress and DNS pinning behavior in the actual Node runtime and managed Worker environment.
- [ ] Review webhook signature replay protection, notification retry/DLQ behavior, secret rotation, redaction, and retention/deletion.
- [ ] Define production alerting/monitoring for queue depth, oldest message age, dead letters, outbox backlog, ClickHouse failures, and service health.
- [ ] Complete accessibility and responsive UI review.
- [x] Add `SECURITY.md` private vulnerability disclosure guidance (PR #151; GitHub private reporting still needs repository configuration).
- [ ] Enable/configure private vulnerability reporting and complete documentation review.

### 3. Ingestion reliability verification

- [ ] Add/execute PostgreSQL failure-injection coverage for queue-send failure and queue acceptance followed by DB commit failure.
- [ ] Verify concurrent request/Cron publishers, quota-once behavior, and recovery throughput against PostgreSQL/Hyperdrive and Cloudflare Queues.
- [ ] Verify identical event identity/timestamps collapse in ClickHouse `FINAL`, including month-boundary fixtures.
- [ ] Verify ingestion and query performance, retention/deletion, and secret redaction.

Track the timestamp/deduplication verification in [issue #73](https://github.com/richard-mante/jerico/issues/73).

### 4. SDK release readiness

- [ ] Build and validate all three SDK packages and their ESM/declaration outputs.
- [ ] Execute browser and Node host-application integration examples, including React/Vite, Astro, Next.js, and Express.
- [ ] Validate ingestion compatibility, request timeout behavior, browser Core Web Vitals, and graceful flush/close behavior.
- [ ] Confirm the project license and dependency-license compatibility; do not assume a license before approval.
- [ ] Keep packages `private: true` until build/sample validation and licensing are complete.
- [ ] Add controlled npm publishing, versioning, changelog, and migration policy after the release decision.

### 5. Longer-term product expansion

- [ ] OpenTelemetry-compatible export/ingestion and richer Node framework adapters.
- [ ] Python and mobile SDKs.
- [ ] Jerico Founder OS financial intelligence and business analysis after Observability is stable.

## Architecture and work tracking

- Provider-neutral queue design: [ADR 0001](../architecture/0001-provider-neutral-durable-queue.md).
- Self-hosted queue/runtime follow-up and acceptance criteria: [issue #107](https://github.com/richard-mante/jerico/issues/107).
- ClickHouse identity/deduplication verification: [issue #73](https://github.com/richard-mante/jerico/issues/73).
- Current implementation handover: [CURRENT-STATE.md](../communications/CURRENT-STATE.md).
- Detailed SDK plan: [Phase 3 TypeScript SDKs](phase-3-typescript-sdks.md).
- Self-hosted operations: [Compose guide](../self-hosting/telemetry-queue-compose.md) and [backup/restore guide](../self-hosting/backup-restore.md).

## Immediate next sequence

1. Continue closing remaining functional implementation gaps without touching the lockfile or starting validation.
2. Keep operational and SDK release documentation aligned with merged code.
3. When the user is ready to validate, start with the clean Linux install and encrypted off-site restore drill, then work through the security, reliability, and SDK release gates above.
