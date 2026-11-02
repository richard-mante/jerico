# Jerico — Current Project Handover

**Last updated:** 2026-11-02  
**Status:** Phase 0 merged; Phase 1 identity and tenancy implementation in review  
**Repository:** https://github.com/richard-mante/jerico  
**Working branch:** feat/phase-1-identity-tenancy  
**Base branch:** main

> Read this file first, then the decision log, session log, architecture, and roadmap. Always inspect actual code before relying on this handover.

## Product direction

Jerico is an extensible open-source Founder Operating System. The first independently useful release is Jerico Observability. It must support managed cloud and self-hosted deployments, monitor Jerico itself, and let external developers instrument their own applications. TypeScript browser and Node SDKs are the initial developer experience.

## Confirmed architecture

- Monorepo: pnpm + Turborepo.
- Web dashboard: Next.js + React + TypeScript.
- Desktop client: Tauri 2 + Vite + React + TypeScript.
- Backend APIs: Hono, designed for Cloudflare Workers and future self-hosted runtime adapters.
- Transactional data: PostgreSQL through Drizzle ORM.
- Telemetry analytics: ClickHouse (not yet implemented).
- Authentication: Better Auth with Drizzle/PostgreSQL adapter and organization plugin.
- Shared contracts and UI: workspace packages.
- Desktop is a separate client of the same APIs; monitoring must continue when desktop is closed.

## Phase 0 status

Merged to main as 6b2e6a0be951db6ff2d0a2f3eb31b4cb6b6ec8e7. The repository contains the pnpm/Turborepo scaffold, Next.js web shell, Tauri desktop shell, Hono management and ingestion Workers, shared UI/contracts, CI workflow, and contribution/security docs.

**Verification remains incomplete:** the earlier GitHub Actions check failed and the repository still needs a generated lockfile plus a complete install/lint/typecheck/test/build run. The Phase 0 PR was merged at the user's explicit request; this is not evidence of passing checks.

## Phase 1 implementation in review

Pull request: https://github.com/richard-mante/jerico/pull/2. Latest branch commit: 43bd98852cf886c02171bc0c764a8fa411723afe.

The feat/phase-1-identity-tenancy branch adds:
- Better Auth identity, session, account, verification, organization, membership, and invitation schema.
- Drizzle database package and initial PostgreSQL migration.
- Email/password auth requiring email verification; Resend adapter and optional Google OAuth configuration.
- Organization-scoped product, project, and environment endpoints with membership checks.
- Composite database foreign keys for same-organization product/project/environment relationships.
- Web sign-in and sign-up screens plus first-run organization/project onboarding, including Development and Production environment creation.
- Shared Zod request contracts and validation tests.

These capabilities are implemented in code but remain unverified against an installed workspace or live PostgreSQL database. Do not call authentication or persistence production-ready until checks and integration tests pass.

## Required environment

- Local: PostgreSQL, DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, EMAIL_FROM.
- Cloudflare API Worker: Hyperdrive binding HYPERDRIVE; Worker secrets for Better Auth and Resend; exact web origin in WEB_APP_URL.
- Google OAuth is optional and requires provider credentials.

## Not implemented yet

ClickHouse telemetry storage, queueing, SDKs, ingestion credential lifecycle, observability dashboard, alerts, uptime probes, self-hosted Docker distribution, API key management, audit logging, and production deployment.

## Next actions

1. Verify Phase 1 code and resolve build/type issues.
2. Provision a disposable PostgreSQL database and run the migration plus auth/resource integration tests.
3. Fix Phase 0 CI startup and generate/commit the lockfile.
4. Build organization switcher and first-project onboarding.
5. Add permission helpers, audit logs, and API key lifecycle.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry here.
