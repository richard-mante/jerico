# Phase 1 — Identity and Tenant Foundation

## Objective

Deliver persistent identity, organizations, memberships, products, projects, and environments. Organization membership is the authorization boundary for every tenant-owned resource.

## Implemented in this slice

- PostgreSQL schema for Better Auth identity, session, account, and verification records.
- Better Auth organization, member, and invitation tables.
- Email/password authentication with a 12-character minimum and mandatory email verification.
- Resend-backed verification, password-reset, and organization-invitation delivery.
- Optional Google OAuth configuration through environment secrets.
- Drizzle schema and initial PostgreSQL SQL migration.
- Organization-scoped product, project, and environment persistence.
- Composite foreign keys prevent projects from referencing products in another organization and environments from referencing projects in another organization.
- Hono endpoints for session lookup, organization list/create, product list/create, project list/create, and environment list/create.
- Web sign-in and sign-up screens.
- Shared Zod request contracts and focused validation tests.

## Deployment configuration required

- Provision PostgreSQL and apply the migration in packages/database/drizzle.
- Set DATABASE_URL for local development and migration tooling.
- Configure Cloudflare Hyperdrive binding HYPERDRIVE for the deployed API Worker.
- Set Worker secrets BETTER_AUTH_SECRET, RESEND_API_KEY, and optional Google OAuth credentials.
- Set BETTER_AUTH_URL, WEB_APP_URL, and EMAIL_FROM to the deployed origins and sender.
- Configure CORS and trusted origins to the exact web origin.
- Do not deploy until the migration is applied and email delivery has been verified.

## Not yet complete

- No live database has been provisioned or migration applied.
- No email provider credentials have been configured.
- No Google OAuth credentials have been configured.
- No organization/project/environment UI beyond sign-in/sign-up.
- No API-key issuance, expanded role model, audit log, or tenant RLS policies.
- No local Docker Compose database stack or PostgreSQL integration tests.
- No production deployment or end-to-end authentication verification.

## Security acceptance criteria

1. Passwords are managed only by Better Auth; Jerico does not implement custom password hashing.
2. Email verification is required before sign-in.
3. Dashboard authentication uses secure session cookies; no tokens are persisted in local storage.
4. Every tenant resource operation derives the user from the session and verifies organization membership server-side.
5. Organization IDs from request headers are untrusted and checked against membership.
6. Project-product and environment-project ownership are protected by composite database foreign keys.
7. Invitation acceptance requires verified email.
8. Provider and database secrets are configured only through deployment secret stores.

## Follow-up

- Add integration tests against a disposable PostgreSQL database.
- Build organization switcher and first-project onboarding.
- Add role-aware permission helpers and audit events.
- Add API key lifecycle for browser/server ingestion credentials.
- Add Docker Compose and managed/self-hosted database adapters.
