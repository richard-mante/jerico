# Jerico — Current Project Handover

**Last updated:** 2026-11-03  
**Status:** Phase 0 merged; Phase 1 identity and tenancy implementation in review  
**Repository:** https://github.com/richard-mante/jerico  
**Working branch:** feat/phase-1-identity-tenancy  
**Base branch:** main  
**Phase 1 PR:** https://github.com/richard-mante/jerico/pull/2

> Read this file first, then the decision log, session log, architecture, and roadmap. Always inspect actual code before relying on this handover.

## Product direction

Jerico is an extensible open-source Founder Operating System. The first independently useful release is Jerico Observability. It must support managed cloud and self-hosted deployments, monitor Jerico itself, and let external developers instrument their own applications. TypeScript browser and Node SDKs are the initial developer experience.

## Confirmed architecture

- Monorepo: pnpm + Turborepo.
- Web dashboard: Next.js + React + TypeScript.
- Desktop client: Tauri 2 + Vite + React + TypeScript.
- Backend APIs: Hono, designed for Cloudflare Workers and future self-hosted runtime adapters.
- Transactional data: PostgreSQL through Drizzle ORM.
- Cloudflare Hyperdrive: Worker-to-PostgreSQL connectivity/pooling layer; code can consume the `HYPERDRIVE` binding, but no production binding ID has been provisioned/configured yet.
- Telemetry analytics: ClickHouse (not yet implemented).
- Authentication: Better Auth with Drizzle/PostgreSQL adapter and organization plugin.
- Shared contracts and UI: workspace packages.
- Desktop is a separate client of the same APIs; monitoring must continue when desktop is closed.

## Phase 0 status

Merged to main as 6b2e6a0be951db6ff2d0a2f3eb31b4cb6b6ec8e7. The repository contains the pnpm/Turborepo scaffold, Next.js web shell, Tauri desktop shell, Hono management and ingestion Workers, shared UI/contracts, CI workflow, and contribution/security docs.

**Verification remains incomplete:** GitHub Actions attempts on the Phase 0 and Phase 1 pull requests have failed before any workflow step was recorded; job logs are unavailable. The repository still needs a generated lockfile plus a complete install/lint/typecheck/test/build run. The Phase 0 PR was merged at the user's explicit request; this is not evidence of passing checks.

## Phase 1 implementation in review

Branch: `feat/phase-1-identity-tenancy`. PR #2 remains open.

Implemented:
- Better Auth identity, session, account, verification, organization, membership, and invitation schema.
- Drizzle database package and initial PostgreSQL migration.
- Email/password auth requiring email verification; Resend adapter and optional Google OAuth configuration.
- Organization-scoped product, project, and environment endpoints with membership checks.
- Composite database foreign keys for same-organization product/project/environment relationships.
- Explicit owner/admin write-permission helper with tests; members remain read-only and unknown roles are denied.
- Web sign-in/sign-up pages and first-run organization/project onboarding, including Development and Production environment creation.
- Shared Zod request contracts and validation tests.
- Organization invitation acceptance page at `apps/web/src/app/accept-invitation/[id]/page.tsx`; signed-in users can accept via Better Auth, and signed-out users are instructed to sign in and reopen the invitation link.

The invitation page was added in commit `076c755da75c0aa20f00270863d8a4f832cadaa6`; continuity docs were updated in subsequent commits. These capabilities remain unverified against an installed workspace or live PostgreSQL database. Do not call authentication or persistence production-ready until checks and integration tests pass.

## Required environment

- Local: PostgreSQL, DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, EMAIL_FROM.
- Cloudflare API Worker: provisioned Hyperdrive binding named HYPERDRIVE; Worker secrets for Better Auth and Resend; exact web origin in WEB_APP_URL.
- Google OAuth is optional and requires provider credentials.
- Never commit credentials or real connection strings.

## Not implemented yet

ClickHouse telemetry storage, queueing, SDKs, ingestion credential lifecycle, observability dashboard, alerts, uptime probes, self-hosted Docker distribution, API key management, audit logging, production deployment, complete organization management/switching, and full project CRUD.

## Validation blockers

- No successful dependency install or committed pnpm lockfile.
- No lint/typecheck/test/build run.
- No PostgreSQL migration execution or Better Auth/tenancy integration test.
- CI job fails before recording steps; latest inspected job has `steps: null` and no downloadable logs. Root cause remains unknown.
- No production Hyperdrive resource/binding ID or email/OAuth secrets configured.

## Next actions

1. Diagnose CI startup and establish a runnable validation environment.
2. Generate and commit the pnpm lockfile; run lint, typecheck, tests, and builds.
3. Provision disposable PostgreSQL, validate/apply the migration, and add Better Auth + tenant-isolation integration tests.
4. Provision Hyperdrive only when a real PostgreSQL resource and binding ID are available; test the Worker connection path.
5. Improve organization switching/member/invitation management and project CRUD.
6. Add audit logging and scoped API key lifecycle, then build the telemetry ingestion pipeline.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry here.
