# Jerico — Current Project Handover

**Last updated:** 2026-11-02  
**Status:** Planning and repository documentation initialized  
**Repository:** https://github.com/richard-mante/jerico  
**Default branch used for initial docs:** `main`

> This file is the first document a new conversation or coding agent should read. Verify all statements against the current repository before acting.

## Product direction

Jerico is the open-source foundation for a broader Founder Operating System. The first independently useful release is **Jerico Observability**.

The product is intended to support both:
- Managed cloud deployment.
- Self-hosted deployment.

The first SDK ecosystem is TypeScript/JavaScript, with browser and Node.js support planned.

The first release strategy is **observability-first**. Broader portfolio management, financial intelligence, integrations, and AI-assisted founder insights follow after the observability product is useful and reliable.

## User-confirmed decisions

- Repository: use the new `jerico` repository for the entire project.
- Product direction: open-source foundation that can later benefit other developers and founders.
- Architecture direction: design for both self-hosted and managed cloud deployment.
- Monitoring scope: support internal monitoring of Jerico itself and monitoring that external developers can add to their own products.
- First release: observability.
- Initial SDK strategy: TypeScript.
- Long-term direction: extensible Founder OS, with integrations and additional modules introduced over time.
- Project continuity: maintain communications and handover records in this repository so a new chat or agent can resume accurately.

## Repository documentation created

- `README.md` — project overview and product direction.
- `docs/architecture/README.md` — architecture, domain model, proposed schema, telemetry, SDK, APIs, security, deployment and testing.
- `docs/roadmap/implementation-plan.md` — phased implementation plan and release gates.
- `docs/communications/` — project continuity and handover records.

## Current implementation status

**Verified completed:** Initial planning/documentation files have been committed to the repository.

**Not yet verified or implemented:** Application workspace, frontend, API, database migrations, ClickHouse tables, queue, SDK packages, ingestion pipeline, monitoring UI, alerting, uptime workers, Docker Compose deployment, and CI.

Do not infer that these components exist merely because they appear in the architecture or roadmap.

## Next concrete actions

1. Inspect the current repository tree, branch, package files, GitHub settings, and existing commits.
2. Confirm whether the repository is empty apart from the planning documents.
3. Establish the engineering foundation in Phase 0: workspace, tooling, conventions, environment validation, CI and contribution/security documents.
4. Validate infrastructure choices with a small technical spike, especially the self-hosted durable queue and ClickHouse development workflow.
5. Begin Phase 1 only after the foundation builds and tests cleanly.

## Important architecture reminders

- Organizations are the tenant and permission boundary.
- Products represent business applications; projects represent technical services. A project may optionally belong to a product.
- PostgreSQL stores transactional/configuration data.
- ClickHouse stores high-volume telemetry.
- Ingestion credentials derive tenant/project/environment identity; never trust those identifiers from the payload.
- Browser ingestion keys are public and narrowly scoped; secret keys are server-only.
- Self-hosted and managed deployments share domain logic and contracts.
- SSRF protection is mandatory for uptime checks.
- Telemetry must be privacy-conscious, bounded, rate-limited, redacted, and subject to retention.
- Prefer a modular monolith and separate deployables only where workload/security boundaries justify them.

## Open questions to resolve during implementation

- Confirm license choice after checking repository state and dependency compatibility; Apache-2.0 is currently proposed, not yet verified as applied.
- Select the durable self-hosted queue after evaluating operational complexity and delivery guarantees.
- Choose authentication implementation after inspecting current dependencies and requirements.
- Validate ClickHouse table engines, ordering keys, and query patterns with representative tests.
- Define exact free-tier quotas and managed-hosting economics before promising pricing.

## Handover rule

At the end of each substantial session, update this file with the latest verified implementation status, links, tests, blockers, and the next concrete action. Append a session entry and update the decision log only when necessary.
