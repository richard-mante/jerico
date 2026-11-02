# Jerico

**Jerico** is an open-source, modular platform for monitoring, understanding, and managing digital products and businesses.

The first independently useful product is **Jerico Observability**: a self-hostable and cloud-ready observability platform with TypeScript SDKs for product analytics, application errors, performance, logs, and uptime.

The longer-term vision is a complete Founder Operating System that combines product intelligence, observability, business intelligence, integrations, and AI-assisted decision support.

## Product direction

- **Open-source core:** designed for community contributions and self-hosting.
- **Two deployment modes:** self-hosted and managed cloud, using the same core product.
- **Observability first:** ship a useful standalone monitoring product before expanding the full Founder OS.
- **TypeScript first:** browser and Node.js SDKs are the initial developer experience.
- **OpenTelemetry compatible:** design telemetry contracts and storage so OTLP ingestion can be added without replacing the native SDK.
- **API-first and modular:** connectors, SDKs, storage, queues, and deployment adapters should be independently extensible.

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

## Architecture at a glance

- **Web:** Next.js, TypeScript, Tailwind CSS, shadcn/ui.
- **API and ingestion:** Hono, with separate management and telemetry boundaries.
- **Core data:** PostgreSQL and Drizzle.
- **Telemetry analytics:** ClickHouse.
- **Processing:** asynchronous queue and background workers.
- **Storage:** S3-compatible object storage.
- **SDKs:** `@jerico/sdk-browser` and `@jerico/sdk-node` (package names are provisional).
- **Deployment:** Docker Compose first; managed-cloud adapters later.

See [Architecture](docs/architecture/README.md) and [Implementation Roadmap](docs/roadmap/implementation-plan.md).

## Repository status

This repository currently contains the product and architecture baseline. Implementation should proceed in small, testable phases. Do not treat planned capabilities as implemented until they have working code, tests, and documentation.

## Contributing

Contribution guidelines and security reporting instructions will be added before the first public development release.

## License

The intended core license is Apache-2.0, subject to a dependency and licensing review before the first release.
