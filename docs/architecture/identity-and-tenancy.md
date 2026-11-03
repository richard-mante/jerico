# Identity, Organizations, and Tenant Resources

## Identity provider

Jerico uses Better Auth with the Drizzle PostgreSQL adapter. Better Auth is a self-hosted open-source library running inside the Hono API Worker; it is not a separately hosted authentication service. Better Auth owns password hashing, credential verification, sessions, email verification, password reset, and organization invitations. Jerico must not implement its own password hashing or session-token format.

The initial sign-in method is email/password. Email verification is required before sign-in. Google OAuth is optional and only enabled when both provider credentials are configured.

Email delivery is an adapter boundary. The first managed implementation uses the Resend HTTP API. The application must fail clearly when email is not configured; it must not silently mark addresses as verified or log verification/reset links. SMTP or another provider can be added behind this boundary without changing authentication.

## Organization tenancy

An organization is the tenant and authorization boundary. Better Auth's organization plugin owns organizations, memberships, and invitations. Its default roles are owner, admin, and member.

All application resources carry an organization ID. A client-supplied organization ID is untrusted even when sent in a dedicated request header. Each request must:
1. Resolve the user from the Better Auth session cookie.
2. Resolve the target organization from explicit request context or active session.
3. Query membership for the authenticated user and target organization.
4. Apply role permissions before writes.
5. Scope every resource query by the authorized organization ID.

Never trust an organization ID from JSON alone and never infer access from a resource ID alone.

## Domain resources

- Product: an optional business/application grouping.
- Project: a technical service/application monitored by Jerico. Its product association is nullable.
- Environment: a project-specific deployment context such as development, staging, or production.

Database constraints reinforce service-layer authorization:
- Product slug unique within an organization.
- Project slug unique within an organization.
- A project can reference only a product from the same organization through a composite foreign key.
- An environment can reference only a project from the same organization through a composite foreign key.
- Deleting an organization cascades to its tenant-owned resources.
- Deleting a project cascades to its environments.

## Credentials and deployment

- Use secure, HTTP-only Better Auth session cookies; do not persist auth tokens in browser local storage.
- Use exact trusted origins and credentialed CORS.
- Store BETTER_AUTH_SECRET, email-provider credentials, OAuth secrets, and production database credentials in deployment secret stores.
- Cloudflare Workers use a Hyperdrive binding for PostgreSQL; local development and migrations use a direct DATABASE_URL.
- The API creates a request-scoped node-postgres Client for each Worker invocation. Hyperdrive owns the origin connection pool, so do not create a global Pool or call client.end() on the Hyperdrive client. The local direct-connection fallback closes its client after the request.
- The Worker must have nodejs_compat enabled for the pg driver. The Wrangler Hyperdrive binding ID must be configured after a real Hyperdrive instance is created; never commit a placeholder ID or database credentials.
- Keep schema and migration files in packages/database so managed and self-hosted deployments share the same domain model.

## Current implementation boundary

The Phase 1 branch adds the initial schema, migration, Better Auth setup, email adapter, organization-scoped resource APIs, and web auth forms. The Hyperdrive client lifecycle follows Cloudflare's request-scoped connection model. The branch has not yet been validated against a real PostgreSQL server or production email provider. A Hyperdrive binding ID and deployment secrets are not configured. Authorization and database integration tests remain required before production use.
