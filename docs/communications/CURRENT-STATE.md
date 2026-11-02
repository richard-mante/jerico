# Jerico — Current Project Handover

**Last updated:** 2026-11-02  
**Status:** Phase 0 foundation scaffold created; verification pending  
**Repository:** https://github.com/richard-mante/jerico  
**Working branch:** `feat/phase-0-monorepo-foundation`  
**Base branch:** `main`

> Read this file first, then the decision log, session log, architecture, and roadmap. Always inspect actual code before relying on this handover.

## Product direction

Jerico is an extensible open-source Founder Operating System. The first independently useful release is Jerico Observability. It must support managed cloud and self-hosted deployments, monitor Jerico itself, and let external developers instrument their own applications. TypeScript browser and Node SDKs are the initial developer experience.

## Confirmed architecture

- Monorepo: pnpm + Turborepo.
- Web dashboard: Next.js + React + TypeScript.
- Desktop client: Tauri 2 + Vite + React + TypeScript.
- Backend APIs: Hono, designed for Cloudflare Workers and future self-hosted runtime adapters.
- Transactional data: PostgreSQL.
- Telemetry analytics: ClickHouse.
- Shared contracts and UI: workspace packages.
- Lit is not the primary application framework; reconsider only for a future framework-neutral embed use case.
- Desktop is a separate client of the same APIs. Monitoring must continue when desktop is closed.
- Validate Next.js deployment on Workers before production; keep Node.js/Docker deployment available as fallback.

## Repository baseline

Planning and architecture documentation exists under `docs/`. The Phase 0 branch adds the initial workspace and application scaffolds.

### Added in the Phase 0 branch

- Root pnpm workspace, Turborepo tasks, TypeScript baseline, Biome configuration, environment example, and ignore rules.
- GitHub Actions validation workflow, PR template, and issue templates.
- Contribution and security policy documents.
- Next.js web application shell.
- Tauri 2 + Vite + React desktop application shell.
- Hono management API Worker and telemetry-ingestion Worker with health endpoints.
- Shared `@jerico/contracts` and `@jerico/ui` workspace packages.

### Explicitly not implemented

- Authentication, authorization, organizations, memberships, projects, environments, or persistence.
- PostgreSQL/Drizzle schema or migrations.
- ClickHouse tables or telemetry queries.
- Durable queue, queue consumers, retry/dead-letter behavior.
- Functional telemetry ingestion, credential verification, rate limits, or redaction.
- SDK packages.
- Alerts, incidents, uptime probes, notifications, or monitoring UI.
- Docker self-hosting, production deployment, or release signing.

The API and ingestion routes intentionally return not-ready/not-implemented responses. Do not treat health endpoints as proof that persistence or telemetry works.

## Verification status

**Not yet run in a local checkout:** dependency installation, Biome, TypeScript checks, Vitest, Next.js build, Wrangler dry-run, Vite build, and native Tauri/Rust build.

GitHub Actions is configured to run formatting, lint, typecheck, tests, and builds on pushes to main and pull requests. The first CI run is the next validation gate. The initial workflow currently installs without a committed lockfile; generate and commit `pnpm-lock.yaml` after a successful install, then switch CI to frozen-lockfile installs.

## Next actions

1. Review the branch diff and resolve any scaffold/configuration issues.
2. Run the first GitHub Actions workflow; fix all failures rather than claiming the scaffold is complete.
3. Generate and commit `pnpm-lock.yaml`; use frozen installs in CI.
4. Validate native Tauri build on Linux and add Windows/macOS build matrix.
5. Test Next.js deployment compatibility on Cloudflare Workers; retain a Node.js/Docker fallback.
6. Add Phase 0 acceptance tests and only then begin Phase 1 database/authentication work.

## Continuity rules

At the end of each substantial session, update this file and append a session-log entry with exact files, commits/PRs, checks run, results, blockers, and the next action. Update the decision log only when a durable decision is made or changed. Never store secrets or production telemetry here.
