# Jerico — Current Project Handover

**Last updated:** 2026-11-03  
**Repository:** https://github.com/richard-mante/jerico  
**Main branch:** `main`  
**Current work branch:** `feat/phase-2-ingestion-credentials`  
**Current milestone:** Phase 2A — Project Ingestion Credentials  
**Phase 2A PR:** https://github.com/richard-mante/jerico/pull/3 (draft)

> Read this file first, then the decision log, session log, architecture, and roadmap. Always inspect actual code before relying on this handover.

## Product direction

Jerico is an extensible open-source Founder Operating System. The first independently useful product is Jerico Observability. It must support managed cloud and self-hosted deployments, monitor Jerico itself, and let external developers instrument their own applications. TypeScript browser and Node SDKs are the initial developer experience.

## Confirmed architecture

- pnpm + Turborepo monorepo.
- Next.js + React + TypeScript web dashboard.
- Tauri 2 + Vite + React + TypeScript desktop client.
- Hono APIs designed for Cloudflare Workers and future self-hosted runtime adapters.
- PostgreSQL + Drizzle for transactional/configuration data.
- Cloudflare Hyperdrive for managed Worker-to-PostgreSQL connectivity.
- ClickHouse for telemetry analytics (not yet implemented).
- Better Auth self-hosted inside the Hono API Worker; no separate authentication hosting subscription.
- Cloudflare Queues planned behind a queue adapter; self-hosted broker implementation still to be selected and validated.
- Cloudflare-specific services must remain behind adapters so self-hosted deployments are viable.

## Phase 0 and Phase 1 status

- Phase 0 foundation merged to `main`.
- Phase 1 identity and tenancy PR #2 merged to `main` as `5952c67ead9868783a7d764d06ca78bf3d4fa37b`.
- Phase 1 code includes Better Auth email/password authentication, PostgreSQL/Drizzle schema and migration, organization/membership/invitation support, organization-scoped product/project/environment APIs, basic web onboarding, and invitation acceptance.
- Better Auth is a self-hosted open-source library running inside the Hono API Worker. It is not a separate hosted service.
- Hyperdrive-aware request-scoped `pg.Client` lifecycle is implemented. A real Hyperdrive resource/binding has not been provisioned.

**Verification remains incomplete:** the repository still has no generated pnpm lockfile; install, lint, typecheck, tests, and builds have not been successfully run. The PostgreSQL migration has not been applied to a real/disposable database. GitHub Actions jobs have repeatedly failed before runner allocation (`runner_id: 0`, no steps/logs); pinning Ubuntu 24.04 did not resolve it. Do not treat this as evidence that code checks pass or fail.

## Phase 2A — Project ingestion credentials

Branch: `feat/phase-2-ingestion-credentials`. Draft PR #3 is open: https://github.com/richard-mante/jerico/pull/3.

Implemented on the branch:
- Added `project_ingestion_keys` Drizzle schema and SQL migration `0001_project_ingestion_keys.sql`.
- Credentials are bound to organization, project, and environment with composite foreign-key constraints.
- Added public (`jk_pub_`) and secret (`jk_sec_`) credential generation using 256-bit Web Crypto randomness.
- Store only SHA-256 hashes and a short display prefix; return the raw credential once at creation.
- Added authenticated project key list/create/revoke endpoints. Owners/admins create and revoke; organization members can view metadata.
- Added shared Zod request contract and unit tests for key generation and request validation.
- Added web credential management page at `/dashboard/projects/[projectId]/keys`, linked from project cards. Supports create, copy-once display, list, and revoke.
- Added Phase 2A implementation/security/validation documentation.

**Not yet implemented:** telemetry ingestion authentication/acceptance, public-vs-secret permission enforcement, payload contracts and limits, redaction, rate limits/quotas, durable queue adapter/consumers, ClickHouse schemas/writes, retries/DLQ/backpressure, and last-used timestamp updates.

## Important security semantics

- A public credential is intentionally usable by browser code but must only authorize the restricted event-ingestion capabilities defined by the ingestion service.
- A secret credential is server-only and must never be exposed to browser bundles.
- Both values are shown only once. Never log, commit, or return a raw key from list/revoke endpoints.
- Tenant/project/environment identity must be derived from the matched credential at ingestion time, never trusted from telemetry payload fields.
- Revocation is represented by `revoked_at`; ingestion must reject revoked credentials.

## Validation blockers

- GitHub Actions run for PR #3 failed before runner allocation; job has no steps or logs.
- No dependency install or pnpm lockfile.
- No lint/typecheck/unit test/build run for Phase 1 or Phase 2A.
- No PostgreSQL migration execution or API integration tests.
- No real Hyperdrive binding or production secrets.
- CI hosted runner allocation issue remains unresolved.
- Phase 2A is not production-ready and must not be merged until validation is possible and database/tenant-isolation tests pass.

## Next actions

1. Review Phase 2A diff, run lint/typecheck/tests/build in a working environment, and test migration + tenant isolation against PostgreSQL.
2. Merge Phase 2A only after validation.
3. Implement the ingestion request contract and credential authentication, including public-vs-secret capability enforcement, revocation checks, payload limits, redaction, rate limiting, and quotas.
4. Select and implement a durable queue adapter for Cloudflare and self-hosted deployments.
5. Add ClickHouse schemas, consumers, retry/DLQ/backpressure handling, and integration tests.
6. Build browser and Node TypeScript SDKs after the ingestion API is stable.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry here.
