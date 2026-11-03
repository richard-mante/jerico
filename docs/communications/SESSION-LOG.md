# Jerico Session Log

## 2026-11-03 — CI runner diagnosis and explicit runner image

- Inspected GitHub Actions run #18 and its underlying job payload. The job has `runner_id: 0`, an empty `runner_name`, and `steps: []`; it starts and fails within seconds before a hosted runner is assigned. This is stronger evidence of a GitHub Actions runner-startup problem than a source-code/test failure, but the precise platform-side cause remains unknown.
- Updated `.github/workflows/ci.yml` to pin the runner label from `ubuntu-latest` to `ubuntu-24.04` for a stable, explicit LTS image.
- Workflow commit: `70a7e4d7399008e287bb17722f1d49f62b3ca421`.
- The subsequent run #20 executed against the updated workflow and still failed before runner allocation: `runner_id: 0`, empty runner name, no steps. Pinning the image did not resolve the issue.
- No CI job has reached checkout, pnpm setup, install, lint, typecheck, tests, or build. Do not report any of those checks as passing or failing.
- PR #2 remains open and must not be merged until the workspace is actually validated.

## 2026-11-03 — Phase 1 Hyperdrive lifecycle review

- Resumed PR #2 on `feat/phase-1-identity-tenancy`; confirmed the PR remains open and the head before this session was `7acd867df7fa8731f80f332de39e4407c8df8fec`.
- Confirmed Better Auth remains the selected self-hosted open-source auth library. It runs inside the Hono API Worker; no separate Better Auth hosting service is needed.
- Reviewed Cloudflare's current Hyperdrive, Drizzle, and node-postgres documentation. Confirmed `pg` + Drizzle is the documented integration and that a fresh `pg.Client` should be created within each Worker invocation. Hyperdrive owns the origin connection pool; Worker request connections are automatically cleaned up at invocation end.
- Updated `apps/api/src/database.ts` to avoid calling `client.end()` for Hyperdrive clients while retaining cleanup for the local direct-PostgreSQL fallback.
- Updated `docs/architecture/identity-and-tenancy.md` to document the self-hosted Better Auth model, request-scoped Hyperdrive connection lifecycle, and outstanding binding/secrets setup.
- Updated `docs/communications/CURRENT-STATE.md` with the implementation and validation status.
- Code commit: `7dad40c71b64a7f1a14ebb85ffacc72bf4d27464` (database lifecycle fix).
- Documentation commit: `80ae14fa18959ac5db187149138396ace0bfdb8e` (identity/tenancy architecture update). Current-state handover was then updated in a later docs commit.
- CI run #16 (created for the database lifecycle commit) failed in approximately three seconds before recording any job steps. GitHub reports `steps: null` and no downloadable logs. This does not identify a source-code failure and remains an unresolved GitHub Actions startup/runner issue.
- No dependency installation, lockfile generation, lint, typecheck, tests, build, PostgreSQL migration, or end-to-end authentication test was run. The Cloudflare Hyperdrive binding ID and deployment secrets are not configured.
- PR #2 remains open and must not be merged until checks and database integration validation pass.

## 2026-11-03 — Phase 1 invitation acceptance flow

- Re-inspected open PR #2 and the `feat/phase-1-identity-tenancy` branch.
- Confirmed the CI job still fails before recording any steps; GitHub reports `steps: null` and no downloadable logs. This remains an infrastructure/workflow-startup blocker, not a diagnosed source-code failure.
- Confirmed Better Auth's documented organization client API uses `authClient.organization.acceptInvitation({ invitationId })`.
- Added `apps/web/src/app/accept-invitation/[id]/page.tsx` with a signed-in acceptance action, clear signed-out guidance, email-match reminder, pending/error/success states, and redirect to the dashboard after acceptance.
- Commit: `076c755da75c0aa20f00270863d8a4f832cadaa6`.
- No dependency installation, lockfile generation, typecheck, build, tests, PostgreSQL migration, or end-to-end auth test was run. The invitation UI is implemented but remains unverified in a running app.
- PR #2 remains open and must not be merged until CI, build, tests, and database integration validation pass.

### Next
- Establish a runnable CI/local validation environment and resolve the GitHub Actions runner allocation issue.
- Generate and commit the pnpm lockfile; run lint/typecheck/tests/build.
- Add PostgreSQL-backed Better Auth and tenancy integration tests and apply the migration to a disposable database.
- Continue organization management/switching, project management, audit logging, and API-key lifecycle after Phase 1 validation.


## 2026-11-03 — Phase 2A project ingestion credentials

- Confirmed Phase 1 PR #2 is merged into `main` as `5952c67ead9868783a7d764d06ca78bf3d4fa37b`.
- Created `feat/phase-2-ingestion-credentials` from the merged `main` branch.
- Added `project_ingestion_keys` Drizzle schema and SQL migration `0001_project_ingestion_keys.sql`. Credentials are constrained to the same organization/project/environment through composite foreign keys; a composite unique index was added to environments for the environment ownership FK.
- Added `createIngestionKeySchema` to shared contracts and validation tests.
- Added Web Crypto credential generation in `apps/api/src/ingestion-keys.ts`: 256-bit random values with `jk_pub_` and `jk_sec_` prefixes; only SHA-256 hash and short prefix are stored.
- Added project credential API routes: list, create, and soft revoke. Membership is checked through the existing organization guard; owner/admin roles can create/revoke, members can list metadata. Raw credentials are returned only in the create response.
- Added a web project credential manager at `/dashboard/projects/[projectId]/keys`, with environment/type selection, one-time credential display/copy, metadata listing, and revocation. Added a dashboard link from each project row.
- Added `docs/roadmap/phase-2-credentials.md`, linked it from the implementation roadmap, updated the root README and current-state handover.
- Current feature branch: `feat/phase-2-ingestion-credentials`. Phase 2A implementation is not yet validated or merged.
- No dependency install, lockfile generation, lint, typecheck, unit tests, build, PostgreSQL migration, or API integration test has been run. GitHub Actions runner allocation remains unresolved.
- The ingestion service remains intentionally disabled. No telemetry write endpoint, queue, ClickHouse storage, rate limiting, quota enforcement, or redaction is implemented in this milestone.

### Next
- Review the full Phase 2A diff for schema/migration consistency, authorization, and UI behavior.
- Establish a working validation environment; generate the pnpm lockfile and run lint/typecheck/tests/build.
- Apply migration to disposable PostgreSQL and test tenant/project/environment isolation and credential revocation.
- Only then open/merge Phase 2A PR and proceed to authenticated telemetry ingestion.
