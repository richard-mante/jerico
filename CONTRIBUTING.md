# Contributing to Jerico

Thanks for your interest in Jerico. The project is in its foundation phase; APIs and package boundaries may evolve until the first public beta.

## Before contributing

1. Read [the current project handover](docs/communications/CURRENT-STATE.md).
2. Read [the architecture](docs/architecture/README.md) and [frontend/desktop architecture](docs/architecture/frontend-and-desktop.md).
3. Check the implementation roadmap and open issues.
4. Discuss substantial product or architecture changes before implementing them.

## Development setup

Requirements:
- Node.js 22.12 or newer.
- pnpm 12.7.0.
- Rust stable and the native prerequisites required by Tauri 2 when working on desktop.

```bash
corepack enable
corepack prepare pnpm@12.7.0 --activate
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Pull requests

- Keep changes focused and explain the problem being solved.
- Add or update tests for behavior changes.
- Update documentation and the communications handover when decisions or project status change.
- Never commit secrets, production telemetry, customer data, or generated build artifacts.
- Do not claim a capability is implemented when it is only scaffolded or planned.
- Include platform-specific test results when changing desktop or deployment code.

## Architecture principles

- Keep the initial backend modular rather than splitting into premature microservices.
- Preserve both self-hosted and managed deployment paths.
- Keep tenant boundaries explicit and test cross-tenant access.
- Keep infrastructure providers behind narrow adapters.
- Treat telemetry as untrusted, privacy-sensitive input.
