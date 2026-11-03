# Jerico

**Jerico** is an open-source, modular platform for monitoring, understanding, and managing digital products and businesses.

The first independently useful product is **Jerico Observability**: a self-hostable and cloud-ready observability platform with TypeScript SDKs for product analytics, application errors, performance, logs, and uptime.

The longer-term vision is a complete Founder Operating System that combines product intelligence, observability, business intelligence, integrations, and AI-assisted decision support.

## Product direction

- **Open-source core:** designed for community contributions and self-hosting.
- **Two deployment modes:** self-hosted and managed cloud, using the same core product.
- **Observability first:** ship a useful standalone monitoring product before expanding the full Founder OS.
- **TypeScript first:** browser and Node.js SDKs are the initial developer experience.
- **Web and desktop:** Next.js powers the web dashboard; Tauri 2 provides a native desktop client using shared React UI.
- **API-first and modular:** connectors, SDKs, storage, queues, and deployment adapters should be independently extensible.

## Technology baseline

- pnpm + Turborepo monorepo.
- Next.js + React + TypeScript web dashboard.
- Tauri 2 + Vite + React + TypeScript desktop client.
- Hono APIs designed for Cloudflare Workers, with self-hosted runtime adapters to follow.
- PostgreSQL for transactional data and ClickHouse for telemetry analytics.
- Shared TypeScript contracts and UI packages.

## MVP capabilities

1. Organizations, memberships, projects, and environments.
2. Project-scoped ingestion credentials.
3. TypeScript browser and Node.js SDKs.
4. Custom event tracking and basic product analytics.
5. JavaScript and server-side error monitoring.
6. Browser performance and Core Web Vitals.
7. Structured logs and basic custom metrics.
8. HTTP uptime monitoring.
9. Alert rules, incidents, and notifications.
10. Docker-based self-hosting and developer documentation.

## Identity and tenancy

Phase 1 introduces Better Auth, PostgreSQL/Drizzle persistence, organizations, memberships, products, projects, and environments. See the [identity and tenancy architecture](docs/architecture/identity-and-tenancy.md) and [Phase 1 roadmap](docs/roadmap/phase-1-identity-tenancy.md). These capabilities are implemented in the Phase 1 merge but remain unverified against a live PostgreSQL deployment. The initial web flow includes sign-up/sign-in and guided organization plus first-project setup. Phase 2A adds project/environment-scoped public and secret ingestion credential management; see [Phase 2A](docs/roadmap/phase-2-credentials.md).

## Repository status

The repository has merged the Phase 0 foundation and Phase 1 identity/tenancy implementation. Phase 2A credential management is under review; telemetry ingestion, SDKs, analytics, alerting, and monitoring workflows remain incomplete. Implemented code is not considered production-ready until dependency installation, automated checks, and database integration tests pass.

## Getting started

Requirements: Node.js 22.12+ and pnpm 12.7.0. Desktop development additionally requires Rust and the native prerequisites for Tauri 2.

```bash
corepack enable
corepack prepare pnpm@12.7.0 --activate
pnpm install
pnpm dev
```

See [Contributing](CONTRIBUTING.md), [Architecture](docs/architecture/README.md), [Frontend and desktop architecture](docs/architecture/frontend-and-desktop.md), and [Implementation roadmap](docs/roadmap/implementation-plan.md).

## License

The intended core license is Apache-2.0, subject to dependency and licensing review before the first public release.
