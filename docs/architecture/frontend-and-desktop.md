# Jerico Frontend and Desktop Architecture

**Status:** Proposed architecture decision, 2026-11-02

## Decisions

- Web dashboard: Next.js + React + TypeScript.
- Desktop client: Tauri 2 + Vite + React + TypeScript.
- Share design-system components, feature UI where practical, API clients, contracts, validation schemas, and domain logic through workspace packages.
- Keep separate web and desktop application shells and routing. Do not run the Next.js server runtime inside Tauri.
- Do not use Lit as the primary application framework. Consider it later only for framework-agnostic embeddable Web Components.
- Desktop is an additional client of the same Jerico APIs, not a second backend. Server-side monitoring must work while the desktop app is closed.

## Why Next.js for web

Jerico's web experience is a complex product dashboard: organization and project management, event exploration, error investigation, charts, logs, metrics, alert configuration, incident workflows, and later Founder OS modules. Next.js provides an integrated React application framework, routing, layouts, rendering options, and a large React ecosystem. It is a better fit than assembling routing, rendering, data loading conventions, and application infrastructure independently.

Cloudflare's current documentation recommends vinext for new Next.js projects on Workers, but documents it as beta. Validate compatibility before making it a production dependency. Keep a supported Node.js/Docker deployment path as a fallback.

## Why not Lit as the main app framework

Lit is a small library for building standard Web Components. Its strengths are small runtime size, scoped styles, and interoperability across frameworks. It is not a direct equivalent to Next.js: routing, application architecture, data loading, server rendering, and much of the application-level ecosystem must be selected and assembled separately.

Jerico controls both clients and can share React packages between them. Introducing Lit as the main UI would create a second component model without enough immediate benefit. Reconsider Lit only if we need independently distributable widgets that customers can embed in arbitrary sites.

## Desktop client

Use Tauri 2 with a Vite-powered React frontend. Initial targets: Linux, Windows, and macOS.

Planned capabilities:
- Native notifications for incidents and alerts.
- System tray and quick access.
- Deep links into projects, errors, and incidents.
- Startup/background behavior controlled by user settings.
- Secure local credential storage using platform facilities where supported.
- Optional local developer integrations in a later phase.

Do not implement a local telemetry collector or background monitoring daemon merely because the desktop client exists. Server-side monitoring continues independently. Any future local agent must be separately scoped and permissioned.

## Suggested workspace shape

~~~text
apps/
  web/                   # Next.js dashboard
  desktop/               # Tauri 2 + Vite + React desktop client
  api/                   # Hono management API
  ingest/                # Hono telemetry ingestion
  worker/                # Queue consumers
  uptime-worker/         # Scheduled uptime probes
  docs/                  # Documentation

packages/
  ui/                    # Shared design system
  feature-projects/      # Shared project UI where useful
  feature-observability/ # Shared observability UI where useful
  api-client/            # Typed API client
  contracts/             # Shared schemas and API contracts
  core/                  # Domain logic and utilities
  config/                # Shared tooling configuration
~~~

This is a target shape, not a requirement to create every package immediately. Start with packages that have real consumers. Web and desktop can have different navigation and platform-specific layouts while sharing visual language and feature components.

## Shared UI rules

- Define tokens, typography, spacing, colors, motion, and accessible primitives once.
- Keep UI components free of Next.js server-only imports.
- Keep platform-specific behavior behind explicit interfaces/adapters.
- Shared components receive data and callbacks rather than depending on app-specific routing or server code.
- Use the same API contracts and API client in both clients.
- Do not share server components with Tauri; desktop consumes client-compatible React components.

## Desktop security

- Apply Tauri capabilities narrowly.
- Validate data crossing the frontend/Rust command boundary.
- Do not expose unrestricted shell, filesystem, or process execution.
- Use secure storage for refresh tokens where supported; never store secrets in plaintext configuration.
- Treat deep links and notification payloads as untrusted input.
- Sign and securely distribute application updates.
- Provide logout and local credential removal.

## Delivery sequence

1. Establish monorepo and shared frontend tooling.
2. Build web shell and shared design system.
3. Build core observability workflows in web.
4. Add Tauri desktop shell using shared React UI and API client.
5. Add native notifications, tray, deep links, and startup preferences.
6. Add packaging and CI for Linux, Windows, and macOS.
7. Validate update signing, permissions, and release procedures.

The desktop shell can be scaffolded during repository foundation, but product-specific desktop functionality should follow the shared web workflows rather than delay the first usable observability release.
