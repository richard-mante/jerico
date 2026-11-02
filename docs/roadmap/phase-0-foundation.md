# Phase 0 — Repository Foundation

## Scope

Create a reproducible workspace and the smallest working shells for the web dashboard, desktop client, management API, and ingestion API. This phase establishes the development workflow; it does not implement observability product functionality.

## Work items

- [x] Establish pnpm workspace and Turborepo task graph.
- [x] Add TypeScript base configuration and Biome configuration.
- [x] Add environment example, ignore rules, and Node runtime declaration.
- [x] Add a Next.js web application shell.
- [x] Add a Tauri 2 + Vite + React desktop shell.
- [x] Add Hono Worker shells for management and ingestion boundaries.
- [x] Add shared TypeScript contracts and reusable UI package.
- [x] Add contribution/security guidance and GitHub PR/issue templates.
- [x] Add CI workflow for workspace validation.
- [ ] Generate and commit the pnpm lockfile; enable frozen installs in CI.
- [ ] Run formatting, lint, typecheck, tests, web/Worker builds, and native Tauri build.
- [ ] Validate the Workers deployment approach and document the Node/Docker fallback.
- [ ] Add Linux, Windows, and macOS desktop build automation.

## Acceptance criteria

1. A clean clone can install using the pinned pnpm version.
2. Root workspace commands run consistently across packages.
3. Web and desktop shells build from the same monorepo and consume shared UI.
4. Management and ingestion Workers have independent health endpoints.
5. Unimplemented API and ingestion functionality returns explicit not-ready responses rather than pretending data was stored.
6. CI passes on pull requests.
7. The repository handover distinguishes scaffolded shells from functional product capabilities.

## Current limitations

The first scaffold has not yet been verified by a local dependency install or CI run. It does not include authentication, persistence, ClickHouse, queues, SDKs, telemetry storage, alerts, uptime probes, or self-hosted Docker deployment.
