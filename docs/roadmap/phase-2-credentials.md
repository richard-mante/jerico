# Phase 2A — Project Ingestion Credentials

**Status:** Implemented on `feat/phase-2-ingestion-credentials`; validation pending.  
**Parent phase:** [Phase 2 — Credentials and Telemetry Ingestion](implementation-plan.md)

## Scope

This milestone delivers project credential management before enabling telemetry writes.

- Credentials are scoped to one organization, project, and environment.
- Public credentials use the `jk_pub_` prefix and are intended for browser SDK event submission.
- Secret credentials use the `jk_sec_` prefix and must remain server-side.
- Both credential types contain 256 bits of cryptographically secure random material.
- PostgreSQL stores only a SHA-256 hash and a short display prefix. The raw value is returned once at creation and is never included in list responses.
- Credentials can be listed by project and revoked. Revocation is a soft state transition so audit context is retained.
- Organization membership is checked on every operation. Owners and admins can create/revoke; members can list metadata.
- Database foreign keys enforce that the project belongs to the organization and the environment belongs to that project.

## API

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/v1/projects/:projectId/keys` | List metadata; never returns raw credentials |
| POST | `/api/v1/projects/:projectId/keys` | Create an environment-scoped public or secret credential; returns raw value once |
| DELETE | `/api/v1/projects/:projectId/keys/:keyId` | Revoke an active credential |

Create body:

```json
{
  "name": "Production browser",
  "environmentId": "environment-id",
  "keyType": "public"
}
```

The response contains the generated `rawKey` only on successful creation. Store it in a secret manager or appropriate application environment variable. Do not commit it, log it, or send it to analytics.

## Database

Migration: `0001_project_ingestion_keys.sql`.

The `project_ingestion_keys` table stores:
- Organization, project, and environment references.
- Display name and key type.
- Short prefix and unique SHA-256 hash.
- Creator, creation time, last-use time, and revocation time.

The migration also adds a composite unique index on `(project_id, id)` for environment ownership enforcement.

## UI

Project cards link to `/dashboard/projects/:projectId/keys`. The credential manager supports environment selection, public/secret type selection, one-time display, copy, metadata listing, and revocation.

## Security boundaries and remaining work

This milestone does **not** yet accept telemetry. The ingestion Worker remains disabled until the next Phase 2 milestone implements:
- Credential lookup and hash verification.
- Public-vs-secret permission enforcement.
- Request/batch schemas, payload and body-size limits.
- Redaction and privacy controls.
- Rate limiting and quotas.
- Durable queue adapter and queue consumers.
- ClickHouse schemas, writes, retries, dead-letter handling, and backpressure.
- Last-used timestamp updates and ingestion health metrics.

## Validation status

No dependency install, lockfile generation, lint, typecheck, unit test, build, PostgreSQL migration, or API integration test has been run in this environment. The repository's GitHub Actions runner allocation issue is still unresolved. Do not merge this milestone or treat it as production-ready until those checks pass and PostgreSQL integration tests verify tenant and environment isolation.
