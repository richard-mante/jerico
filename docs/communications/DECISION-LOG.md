# Jerico Decision Log

This log records durable decisions. New entries should include date, decision, rationale, implications, and whether they supersede an earlier choice.

## D-001 — Use Jerico as the single project repository
- **Date:** 2026-11-02
- **Decision:** All Founder OS and Observability development belongs in the `richard-mante/jerico` repository.
- **Rationale:** Keep architecture, implementation, SDKs, documentation, deployment and future modules together.
- **Implication:** Use a modular monorepo; do not create a separate Observability repository at this stage.

## D-002 — Build an extensible open-source foundation
- **Date:** 2026-11-02
- **Decision:** Design Jerico so other developers, indie founders and teams can benefit from it, with the possibility of community contributions and future hosted offerings.
- **Rationale:** Avoid designing a one-off private dashboard that cannot become a reusable platform.
- **Implication:** Document public APIs, contribution conventions, self-hosting, licensing, and extension points. License choice remains subject to review.

## D-003 — Observability is the first release
- **Date:** 2026-11-02
- **Decision:** Ship observability as the first independently useful product before broader Founder OS modules.
- **Rationale:** A focused first release is easier to validate and deliver.
- **Implication:** Prioritize event ingestion, errors, performance, logs, uptime, alerts, SDKs and monitoring UI. Financial intelligence and AI business analysis are later phases.

## D-004 — Support both internal and external monitoring
- **Date:** 2026-11-02
- **Decision:** Jerico must monitor its own services and allow users to instrument and monitor their own applications.
- **Rationale:** Internal dogfooding improves reliability while the same platform provides customer value.
- **Implication:** Use the same telemetry pipeline and product capabilities, but isolate Jerico's own operational environment and access from customer tenants. Internal monitoring must not depend on the public customer dashboard being healthy.

## D-005 — Support self-hosted and managed cloud deployment
- **Date:** 2026-11-02
- **Decision:** Design for both deployment models.
- **Rationale:** Self-hosting supports open-source adoption and data control; managed cloud reduces operational burden for users.
- **Implication:** Keep core domain logic infrastructure-neutral and provide adapters for queue, storage, email, scheduling and database services. Docker Compose is the first self-hosting target.

## D-006 — TypeScript is the first SDK language
- **Date:** 2026-11-02
- **Decision:** Start with browser and Node.js TypeScript SDKs.
- **Rationale:** A strong initial ecosystem covers common web and server applications.
- **Implication:** Build shared SDK contracts/core and separate browser and Node.js packages. Other languages are future work.

## D-007 — Keep product and project separate
- **Date:** 2026-11-02
- **Decision:** A product is a business/application concept; a project is a technical service or application. Projects may optionally belong to products.
- **Rationale:** A single product can have multiple independently monitored services, and standalone monitoring users may not need a business product record.
- **Implication:** Organization owns products and projects; project.product_id is nullable.

## D-008 — Maintain repository-based communications memory
- **Date:** 2026-11-02
- **Decision:** Keep concise communications, decisions, progress and handover records in `docs/communications/`.
- **Rationale:** New ChatGPT conversations and coding agents should be able to resume without relying on chat history.
- **Implication:** Update current state and session log after substantial work; avoid storing full transcripts, secrets or customer data.

## D-009 — Use a pnpm and Turborepo monorepo
- **Date:** 2026-11-02
- **Decision:** Manage web, desktop, API, ingestion, SDKs, shared packages, and docs in one pnpm/Turborepo repository.
- **Rationale:** Share contracts and UI while keeping deployable applications separate.
- **Implication:** Add workspace packages only when there is a real consumer; use Turbo for task orchestration and caching.

## D-010 — Web uses Next.js; desktop uses Tauri 2 with React/Vite
- **Date:** 2026-11-02
- **Decision:** Use Next.js + React + TypeScript for web and Tauri 2 + Vite + React + TypeScript for desktop.
- **Rationale:** Next.js suits the complex dashboard; Tauri supplies native desktop capabilities while reusing React UI.
- **Implication:** Keep distinct app shells, share UI/contracts/API clients where practical, and do not make monitoring dependent on desktop being open.

## D-011 — Hono Workers are the initial managed backend runtime
- **Date:** 2026-11-02
- **Decision:** Use Hono for management and ingestion APIs, initially deployed to Cloudflare Workers, with self-hosted runtime adapters planned.
- **Rationale:** TypeScript/Web Standards alignment and a small runtime fit the managed deployment direction.
- **Implication:** Keep domain logic provider-neutral and validate the Next.js-on-Workers path before production.
