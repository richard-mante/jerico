# Jerico Technical Architecture

**Status:** Proposed architecture baseline  
**First release:** Jerico Observability  
**Long-term product:** Founder Operating System  
**Deployment targets:** Self-hosted and managed cloud  
**Initial SDK ecosystem:** TypeScript / JavaScript

This document is the source of truth for architectural decisions. It describes intended behavior; it does not claim that the features are already implemented.

## 1. Product boundaries

Jerico has three related product areas:

1. **Jerico Core:** identity, organizations, projects, environments, permissions, integrations, configuration, and shared APIs.
2. **Jerico Observability:** standalone monitoring for events, errors, performance, logs, metrics, uptime, alerts, and incidents.
3. **Founder OS capabilities:** portfolio management, revenue and expense intelligence, business metrics, goals, integrations, and AI analysis. These are later phases.

Observability must be usable without enabling the broader Founder OS modules. A developer can create a workspace, create a project, install an SDK, and use monitoring independently.

## 2. Architectural principles

- Modular monolith initially; split deployment processes only where workload or security boundaries justify it.
- Multi-tenant from the beginning.
- Organization is the tenant and permission boundary.
- A product is a business/application concept; a project is a technical service or application.
- A project may optionally belong to a product, allowing standalone monitoring.
- Every project can have multiple environments such as development, staging, and production.
- API-first: dashboard operations should have documented API equivalents.
- PostgreSQL is the source of truth for configuration and transactional records.
- ClickHouse is the analytical store for high-volume telemetry.
- Telemetry ingestion must be asynchronous, bounded, validated, and rate-limited.
- Self-hosted and cloud deployments use the same domain model and application code.
- Infrastructure-specific services are accessed through narrow adapters.
- Collect the minimum telemetry needed; redact sensitive data and provide retention controls.
- Do not claim support for a feature until it has implementation, tests, and documentation.

## 3. System overview

```text
Browser / Node SDKs / future OTLP clients
                 |
                 v
        Telemetry Ingestion API
                 |
      Credential validation / quotas
                 |
        Schema validation / redaction
                 |
          Queue or durable buffer
                 |
          Processing workers
                 |
       +---------+----------+
       |         |          |
       v         v          v
    Events     Errors     Metrics / Logs
       |         |          |
       +---------+----------+
                 |
             ClickHouse
                 |
          Query / Aggregation API
                 |
            Web dashboard

Dashboard -> Core API -> PostgreSQL
                         |
                  integrations,
                  projects, keys,
                  alerts, monitors,
                  users and access

Uptime scheduler -> probe workers -> results -> ClickHouse
                                      |
                               state transitions
                                      |
                              incident / notification
```

### 3.1 Deployable applications

| App | Responsibility |
|---|---|
| `apps/web` | Main dashboard and developer console |
| `apps/api` | Authentication, organizations, projects, configuration, query APIs |
| `apps/ingest` | Public telemetry ingestion and validation |
| `apps/worker` | Queue consumers, normalization, aggregation, alert evaluation |
| `apps/uptime-worker` | Scheduled HTTP checks and status transitions |
| `apps/docs` | Product, SDK, API, and self-hosting documentation |

These are logical deployables. During early development, some processes may share packages and deployment infrastructure. Avoid premature microservices.

## 4. Technology decisions

| Area | Initial choice | Notes |
|---|---|---|
| Monorepo | pnpm + Turborepo | Shared contracts and packages |
| Language | TypeScript | SDK and application consistency |
| Web | Next.js | Dashboard and developer experience |
| UI | Tailwind CSS + shadcn/ui | Accessible, composable components |
| HTTP APIs | Hono | Core and ingestion APIs |
| Validation | Zod | Runtime request validation |
| ORM | Drizzle | PostgreSQL schema and migrations |
| Transactional DB | PostgreSQL | Identity, configuration, tenancy |
| Telemetry DB | ClickHouse | Events, errors, metrics, logs, uptime history |
| Queue | Adapter interface; self-hosted implementation selected during spike | Must support durable delivery and retries |
| Cache | Redis/Valkey-compatible adapter | Cache and coordination only where needed |
| Object storage | S3-compatible | Optional artifacts and exports |
| Containers | Docker Compose | First self-hosted distribution |
| Tests | Vitest + Playwright | Unit, integration, and end-to-end |
| API docs | OpenAPI | Generated from validated route contracts where practical |

### 4.1 Important infrastructure qualification

Do not commit to Cloudflare Queues as the only queue implementation because the same system must be self-hostable. First benchmark and choose a durable self-hosted queue/broker that works with Docker Compose. Implement a queue interface so a managed deployment can use an appropriate managed adapter later.

ClickHouse should be included in the self-hosted compose stack. PostgreSQL should not be used as the long-term raw telemetry warehouse.

## 5. Monorepo layout

```text
jerico/
├── apps/
│   ├── web/
│   ├── api/
│   ├── ingest/
│   ├── worker/
│   ├── uptime-worker/
│   └── docs/
├── packages/
│   ├── ui/
│   ├── core/
│   ├── contracts/
│   ├── database/
│   ├── auth/
│   ├── permissions/
│   ├── telemetry/
│   ├── telemetry-storage/
│   ├── queue/
│   ├── storage/
│   ├── notifications/
│   ├── sdk-core/
│   ├── sdk-browser/
│   ├── sdk-node/
│   ├── config/
│   └── testing/
├── infrastructure/
│   ├── docker/
│   ├── postgres/
│   ├── clickhouse/
│   └── deployment/
├── examples/
│   ├── nextjs/
│   ├── astro/
│   ├── react/
│   └── express/
├── docs/
│   ├── architecture/
│   └── roadmap/
├── .github/workflows/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
└── README.md
```

Do not create empty packages solely to match this diagram. Add each package when its first consumer is implemented.

## 6. Core domain model

### 6.1 Relationships

```text
User
  | many-to-many through Membership
Organization
  |-- Products (0..n)
  |-- Projects (0..n)
  |     |-- Environments (1..n)
  |     |-- API Keys (1..n)
  |     |-- Alert Rules
  |     |-- Uptime Monitors
  |     |-- Incidents
  |-- Integrations
  |-- Notification Channels
  |-- Audit Logs

Product (optional association)
  |-- Projects
```

Every tenant-owned record must be scoped to an organization. Enforce authorization in the service layer and use PostgreSQL row-level security where it provides meaningful defense in depth. Never rely on an untrusted organization ID supplied by the client.

### 6.2 PostgreSQL schema baseline

Use UUID primary keys, UTC timestamps, explicit foreign keys, indexes for access patterns, and soft deletion/archive only where recovery is useful.

#### users
- `id UUID PRIMARY KEY`
- `email TEXT NOT NULL UNIQUE`
- `name TEXT`
- `avatar_url TEXT`
- `email_verified_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

Authentication provider accounts, sessions, verification tokens, and password credentials (if password auth is supported) should follow the selected auth library's recommended schema. Do not invent custom password storage.

#### organizations
- `id UUID PRIMARY KEY`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL UNIQUE`
- `owner_id UUID NOT NULL REFERENCES users(id)`
- `plan TEXT NOT NULL DEFAULT 'free'`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

#### memberships
- `id UUID PRIMARY KEY`
- `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `user_id UUID NOT NULL REFERENCES users(id)`
- `role TEXT NOT NULL` — owner, admin, member, viewer
- `created_at TIMESTAMPTZ NOT NULL`
- Unique constraint on `(organization_id, user_id)`.

#### products
- `id UUID PRIMARY KEY`
- `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL`
- `description TEXT`
- `website_url TEXT`
- `status TEXT NOT NULL DEFAULT 'active'`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`
- Unique constraint on `(organization_id, slug)`.

#### projects
- `id UUID PRIMARY KEY`
- `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `product_id UUID REFERENCES products(id)` — nullable
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL`
- `framework TEXT`
- `platform TEXT NOT NULL` — web, server, desktop, other
- `status TEXT NOT NULL DEFAULT 'active'`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`
- Unique constraint on `(organization_id, slug)`.

Validate that an associated product belongs to the same organization.

#### environments
- `id UUID PRIMARY KEY`
- `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `project_id UUID NOT NULL REFERENCES projects(id)`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL`
- `is_production BOOLEAN NOT NULL DEFAULT false`
- `created_at TIMESTAMPTZ NOT NULL`
- Unique constraint on `(project_id, slug)`.

#### api_keys
- `id UUID PRIMARY KEY`
- `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `project_id UUID NOT NULL REFERENCES projects(id)`
- `environment_id UUID NOT NULL REFERENCES environments(id)`
- `name TEXT NOT NULL`
- `key_prefix TEXT NOT NULL`
- `key_hash TEXT NOT NULL`
- `key_type TEXT NOT NULL` — public_ingest or secret
- `last_used_at TIMESTAMPTZ`
- `expires_at TIMESTAMPTZ`
- `revoked_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL`

Store only a secure hash of the credential. Return the raw value once at creation. Public browser ingestion keys are intentionally public and must only permit narrowly scoped ingestion. Secret keys must never enter browser bundles.

#### integrations
- `id UUID PRIMARY KEY`
- `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `product_id UUID REFERENCES products(id)`
- `provider TEXT NOT NULL`
- `name TEXT NOT NULL`
- `status TEXT NOT NULL`
- `configuration JSONB NOT NULL DEFAULT '{}'` — non-secret settings only
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

OAuth tokens and other credentials belong in an encrypted secrets facility. Never store plaintext provider secrets in JSONB.

#### alert_rules
- `id UUID PRIMARY KEY`
- `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `project_id UUID NOT NULL REFERENCES projects(id)`
- `environment_id UUID REFERENCES environments(id)`
- `name TEXT NOT NULL`
- `metric TEXT NOT NULL`
- `operator TEXT NOT NULL`
- `threshold NUMERIC NOT NULL`
- `window_seconds INTEGER NOT NULL`
- `severity TEXT NOT NULL`
- `enabled BOOLEAN NOT NULL DEFAULT true`
- `configuration JSONB NOT NULL DEFAULT '{}'`
- `created_at TIMESTAMPTZ NOT NULL`

#### incidents
- `id UUID PRIMARY KEY`
- `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `project_id UUID NOT NULL REFERENCES projects(id)`
- `alert_rule_id UUID REFERENCES alert_rules(id)`
- `title TEXT NOT NULL`
- `severity TEXT NOT NULL`
- `status TEXT NOT NULL` — open, acknowledged, resolved
- `started_at TIMESTAMPTZ NOT NULL`
- `acknowledged_at TIMESTAMPTZ`
- `resolved_at TIMESTAMPTZ`

#### uptime_monitors
- `id UUID PRIMARY KEY`
- `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `project_id UUID NOT NULL REFERENCES projects(id)`
- `name TEXT NOT NULL`
- `url TEXT NOT NULL`
- `method TEXT NOT NULL DEFAULT 'GET'`
- `interval_seconds INTEGER NOT NULL`
- `timeout_ms INTEGER NOT NULL`
- `expected_status INTEGER NOT NULL DEFAULT 200`
- `enabled BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ NOT NULL`

Validate URLs and resolve DNS safely at check time. Block loopback, private, link-local, metadata-service, and otherwise prohibited destinations to prevent SSRF. Revalidate redirects and DNS resolution.

#### notification_channels
Store organization-scoped email and webhook destinations, delivery preferences, verification state, and encrypted credentials.

#### audit_logs
Record security-sensitive operations: membership changes, key creation/revocation, project deletion, integration authorization, alert changes, and administrative actions.

### 6.3 ClickHouse telemetry schema

Use separate MergeTree-family tables with time partitioning, stable sorting keys, TTL policies, and tenant/project/time filters. Final engine and key choices must be validated with realistic query benchmarks.

#### telemetry_events
- timestamp DateTime64
- event_id UUID
- organization_id UUID
- project_id UUID
- environment_id UUID
- anonymous_id String
- user_id Nullable(String)
- session_id Nullable(String)
- event_name LowCardinality(String)
- page_url Nullable(String)
- properties String
- sdk_name LowCardinality(String)
- sdk_version LowCardinality(String)

#### telemetry_errors
- timestamp DateTime64
- event_id UUID
- organization_id UUID
- project_id UUID
- environment_id UUID
- fingerprint String
- error_type String
- message String
- stack_trace Nullable(String)
- source LowCardinality(String)
- release Nullable(String)
- user_id Nullable(String)
- properties String

#### telemetry_metrics
- timestamp DateTime64
- event_id UUID
- organization_id UUID
- project_id UUID
- environment_id UUID
- metric_name LowCardinality(String)
- metric_type LowCardinality(String)
- value Float64
- unit Nullable(String)
- attributes String

#### telemetry_logs
- timestamp DateTime64
- event_id UUID
- organization_id UUID
- project_id UUID
- environment_id UUID
- severity LowCardinality(String)
- message String
- trace_id Nullable(String)
- attributes String

#### uptime_results
- timestamp DateTime64
- monitor_id UUID
- organization_id UUID
- project_id UUID
- status_code UInt16
- response_time_ms UInt32
- success Bool
- error Nullable(String)
- region LowCardinality(String)

Use bounded dimensions and enforce payload limits. Avoid uncontrolled high-cardinality labels. Store JSON in a queryable format only where necessary; promote commonly filtered attributes into typed columns.

### 6.4 Data retention defaults

Initial configurable defaults:
- Raw product events: 30 days.
- Errors: 30 days.
- Logs: 7 days.
- Performance measurements: 30 days.
- Uptime history: 30 days.
- Daily aggregates: 12 months.
- Audit records: 12 months.

Actual limits must be visible in the product and enforced by the processing/storage lifecycle. Self-hosted administrators can configure their own retention.

## 7. Telemetry ingestion pipeline

### 7.1 Request lifecycle

1. Receive a bounded batch.
2. Authenticate the project/environment ingestion credential.
3. Derive tenant, project, and environment from the credential; never trust those identifiers from the request body.
4. Apply rate and quota checks.
5. Validate schema version and payload limits.
6. Apply configured redaction and privacy rules.
7. Enqueue durably.
8. Return accepted/rejected counts and a request ID.
9. Worker validates and normalizes the record.
10. Deduplicate where supported.
11. Write to ClickHouse in batches.
12. Update aggregates and evaluate applicable alerts asynchronously.

### 7.2 Delivery semantics

Assume at-least-once delivery between ingestion and processing. Use stable event IDs and idempotent processing strategies. Do not promise exactly-once delivery across distributed queues and storage.

Define retry limits, dead-letter handling, poison-message behavior, and queue backpressure before production release.

### 7.3 Initial envelope

The wire contract should be versioned and validated. A conceptual TypeScript type:

```ts
type TelemetryType = 'event' | 'error' | 'metric' | 'log';

interface TelemetryEnvelope {
  schemaVersion: 1;
  eventId: string;
  type: TelemetryType;
  timestamp: string;
  sdk: {
    name: string;
    version: string;
    platform: string;
  };
  payload: Record<string, unknown>;
}
```

Project and environment identity are derived from the credential. The SDK may include context, but the server controls the authoritative tenant boundary.

### 7.4 Limits

Define centrally configurable limits for:
- Maximum compressed and uncompressed request bytes.
- Maximum events per batch.
- Maximum property depth and count.
- Maximum string and stack-trace lengths.
- Maximum timestamp skew.
- Per-key and per-project event rates.
- Per-organization daily quotas.

Return actionable 4xx responses for invalid requests and retryable 5xx responses only when appropriate.

## 8. TypeScript SDK architecture

Initial packages:
- `@jerico/sdk-core`
- `@jerico/sdk-browser`
- `@jerico/sdk-node`

Package names are provisional and should be checked for availability before publishing.

### 8.1 Shared SDK core

Responsibilities:
- Typed public API.
- Event queue and batching.
- HTTP transport.
- Retry with bounded exponential backoff and jitter.
- Flush lifecycle.
- Schema versioning.
- Context propagation.
- Sampling and redaction hooks.
- Non-throwing behavior for instrumentation failures.

### 8.2 Browser SDK

Initial capabilities:
- Custom event tracking.
- Anonymous visitor ID.
- Session ID.
- Optional identify/reset.
- Page navigation tracking.
- JavaScript exceptions.
- Unhandled promise rejections.
- Core Web Vitals.
- Consent and opt-out controls.
- Batching and best-effort page-exit flush.

Do not capture form values, passwords, payment details, full request/response bodies, or sensitive DOM content by default.

### 8.3 Node SDK

Initial capabilities:
- Custom event tracking.
- Error capture.
- Structured logs.
- Custom metrics.
- Request context hooks.
- Batching and retries.
- Explicit flush and graceful shutdown.

Server credentials must only be used server-side. Avoid automatic collection of authorization headers, cookies, request bodies, or secrets.

### 8.4 Illustrative browser API

```ts
import { FounderOS } from '@jerico/sdk-browser';

FounderOS.init({
  projectKey: process.env.NEXT_PUBLIC_JERICO_KEY!,
  environment: 'production',
  captureErrors: true,
  capturePerformance: true,
});

FounderOS.track('signup_completed', {
  method: 'google',
});

FounderOS.identify('user_123', {
  plan: 'pro',
});
```

### 8.5 Illustrative Node API

```ts
import { FounderOS } from '@jerico/sdk-node';

FounderOS.init({
  projectKey: process.env.JERICO_SECRET_KEY!,
  environment: 'production',
});

FounderOS.track('order_processed', {
  orderId: 'order_123',
});

await FounderOS.flush();
```

The exact API must be finalized through SDK contract tests and documentation before a stable 1.0 release.

## 9. API design

Use versioned REST APIs initially.

Core API base: `/api/v1`  
Ingestion base: `/ingest/v1`

### 9.1 Authentication and organization

| Method | Route | Purpose |
|---|---|---|
| GET | /organizations | List memberships |
| POST | /organizations | Create organization |
| GET | /organizations/:id | Read organization |
| PATCH | /organizations/:id | Update organization |
| GET | /organizations/:id/members | List members |
| POST | /organizations/:id/invitations | Invite member |
| DELETE | /organizations/:id/members/:userId | Remove member |

### 9.2 Products and projects

| Method | Route | Purpose |
|---|---|---|
| GET | /products | List products |
| POST | /products | Create product |
| GET | /products/:id | Read product |
| PATCH | /products/:id | Update product |
| GET | /projects | List projects |
| POST | /projects | Create project |
| GET | /projects/:id | Read project |
| PATCH | /projects/:id | Update project |
| DELETE | /projects/:id | Archive project |
| GET | /projects/:id/environments | List environments |
| POST | /projects/:id/environments | Create environment |

### 9.3 API keys

| Method | Route | Purpose |
|---|---|---|
| GET | /projects/:id/keys | List key metadata |
| POST | /projects/:id/keys | Create key |
| DELETE | /projects/:id/keys/:keyId | Revoke key |

Return raw credentials once only. Never include them in logs or analytics.

### 9.4 Ingestion

| Method | Route | Purpose |
|---|---|---|
| POST | /events | Ingest event batch |
| POST | /errors | Ingest errors |
| POST | /metrics | Ingest metrics |
| POST | /logs | Ingest structured logs |

All ingestion routes are under `/ingest/v1`.

Example:

```json
{
  "schemaVersion": 1,
  "events": [
    {
      "eventId": "018f0000-0000-7000-8000-000000000001",
      "timestamp": "2026-11-02T09:00:00Z",
      "eventName": "signup_completed",
      "properties": {
        "method": "google"
      },
      "sessionId": "session_123",
      "anonymousId": "anonymous_123"
    }
  ]
}
```

Example response:

```json
{
  "accepted": 1,
  "rejected": 0,
  "requestId": "req_123"
}
```

### 9.5 Analytics queries

| Method | Route | Purpose |
|---|---|---|
| GET | /projects/:id/overview | Summary |
| GET | /projects/:id/events | Event explorer |
| GET | /projects/:id/events/names | Event catalogue |
| GET | /projects/:id/analytics/timeseries | Time-series |
| GET | /projects/:id/analytics/top-events | Top events |
| GET | /projects/:id/errors | Error groups |
| GET | /projects/:id/errors/:fingerprint | Error details |
| GET | /projects/:id/errors/:fingerprint/events | Occurrences |
| GET | /projects/:id/performance/overview | Performance summary |
| GET | /projects/:id/performance/vitals | Web vitals |
| GET | /projects/:id/performance/routes | Route performance |
| GET | /projects/:id/logs | Structured log explorer |

### 9.6 Uptime, alerts, and incidents

| Method | Route | Purpose |
|---|---|---|
| GET | /projects/:id/monitors | List monitors |
| POST | /projects/:id/monitors | Create monitor |
| PATCH | /monitors/:id | Update monitor |
| DELETE | /monitors/:id | Delete monitor |
| GET | /monitors/:id/history | Check history |
| GET | /monitors/:id/status | Current state |
| GET | /projects/:id/alerts | List alert rules |
| POST | /projects/:id/alerts | Create alert |
| PATCH | /alerts/:id | Update alert |
| GET | /projects/:id/incidents | List incidents |
| PATCH | /incidents/:id | Acknowledge or resolve |

### 9.7 API standards

Every endpoint should have:
- Zod request and response schemas.
- OpenAPI documentation.
- Consistent error envelope.
- Request ID.
- Pagination conventions.
- Authentication and permission requirements.
- Tenant isolation tests.
- Rate limits where appropriate.

Do not expose raw ClickHouse queries to clients.

## 10. Security architecture

Security is a release requirement, not a later enhancement.

### Authentication
- Use a maintained authentication library.
- Secure, HttpOnly, SameSite cookies for browser sessions where applicable.
- CSRF protection for cookie-authenticated mutations.
- Email verification and secure recovery flows.
- Optional OAuth providers as separate integrations.

### Authorization
- Centralized role/permission checks.
- Tenant-scoped repository methods.
- Validate organization ownership of every referenced project, product, environment, monitor, and key.
- Add cross-tenant access tests for every resource category.

### Ingestion
- Public keys can only submit allowed telemetry.
- Secret keys are server-only.
- Hash stored keys.
- Support revocation and rotation.
- Apply request size limits and rate limits.
- Redact sensitive fields.
- Never trust client-provided tenant identifiers.

### Uptime SSRF protection
- Allow only supported HTTP/HTTPS protocols.
- Block loopback, private, link-local, multicast, and cloud metadata destinations.
- Resolve and validate DNS at execution time.
- Revalidate every redirect.
- Protect against DNS rebinding.
- Restrict redirect count and response size.
- Do not forward user-supplied credentials by default.

### Data privacy
- Configurable consent.
- Configurable retention.
- Project deletion and data deletion workflows.
- Pseudonymous visitor identity by default.
- No automatic capture of form values or sensitive headers.
- Document telemetry collection clearly.

### Operational security
- Secret management.
- Audit logging.
- Dependency scanning.
- Container image scanning.
- Backup and restore tests.
- Security disclosure process.

## 11. Alerts and uptime behavior

### Initial alert types
- Error count exceeds threshold.
- Error rate exceeds threshold.
- Endpoint is unavailable.
- Response time exceeds threshold.
- Performance metric exceeds threshold.

### Incident lifecycle
- Triggered.
- Acknowledged.
- Resolved.

Avoid duplicate incident creation. Use alert state transitions and deduplication windows.

### Uptime checks
- Configurable interval.
- Timeout.
- Expected HTTP status.
- Bounded response body inspection, if enabled.
- Consecutive failure/success thresholds.
- Probe region recorded.
- Status transition generates incident and notification.

Initial self-hosted deployments may use one probe region. Multi-region probing is a later capability.

## 12. Frontend information architecture

### Main navigation

**Workspace**
- Overview
- Projects
- Products
- Activity

**Observability**
- Analytics
- Events
- Errors
- Performance
- Logs
- Uptime
- Alerts
- Incidents

**Settings**
- Integrations
- API keys
- Environments
- Members
- Usage and retention
- Workspace settings

### Project navigation

Every project should have:
- Overview.
- Analytics.
- Errors.
- Performance.
- Logs.
- Uptime.
- Alerts.
- Settings.

The interface should prioritize useful empty states, onboarding, clear time-range selection, environment filtering, responsive layouts, and fast navigation.

Do not build every screen before the underlying data and APIs work.

## 13. Self-hosted and managed deployment

### Self-hosted

First distribution: Docker Compose.

Expected services:
- Web.
- Core API.
- Ingestion API.
- Background worker.
- Uptime worker.
- PostgreSQL.
- ClickHouse.
- Queue/broker.
- Optional object storage.
- Reverse proxy.

Requirements:
- One documented setup command after environment configuration.
- Health checks.
- Persistent volumes.
- Migration command.
- Backup and restore instructions.
- Upgrade documentation.
- Configurable secrets and retention.

### Managed cloud

Use the same application and domain model.

Managed services may replace self-hosted adapters for:
- PostgreSQL.
- ClickHouse.
- Queue.
- Object storage.
- Email delivery.
- Scheduling.

Do not introduce cloud-only product behavior into core business logic.

## 14. Observability for Jerico itself

Jerico must monitor its own ingestion and processing pipeline.

Track:
- Ingestion request rate.
- Accepted and rejected records.
- Queue depth and oldest message age.
- Processing throughput.
- Processing failures.
- ClickHouse insert latency.
- Query latency.
- SDK delivery errors.
- Uptime probe execution delays.
- Alert evaluation delays.
- Per-tenant resource consumption.

Never let a single noisy tenant degrade all other tenants. Add quotas, backpressure and fair processing.

## 15. Testing strategy

### Unit tests
- Domain rules.
- Validation.
- Permission policies.
- Key hashing and verification.
- Event normalization.
- Redaction.
- Error fingerprinting.
- Alert state transitions.

### Integration tests
- PostgreSQL repositories.
- ClickHouse writes and queries.
- Queue retry behavior.
- Ingestion authentication.
- SDK transport.
- Notification delivery.
- Retention and deletion.

### Security tests
- Cross-tenant reads and writes.
- Revoked credentials.
- Expired credentials.
- Public key privilege boundaries.
- Payload abuse.
- SSRF attempts.
- Secret redaction.
- Rate limiting.

### End-to-end tests
1. Register.
2. Create workspace.
3. Create project.
4. Create environment and ingestion key.
5. Send SDK event.
6. View event in dashboard.
7. Generate an error.
8. View error group.
9. Create uptime monitor.
10. Trigger and resolve an incident.

### Performance tests
- Batch ingestion.
- Sustained event throughput.
- Queue backpressure.
- Dashboard query latency.
- High-cardinality payload behavior.
- Concurrent tenant isolation.

## 16. Definition of MVP complete

The MVP is not complete merely because the dashboard renders.

It is complete when:

- A new user can onboard without manual database changes.
- A project can be configured entirely through the UI/API.
- Browser and Node SDKs can submit telemetry.
- Ingestion is authenticated, validated and rate-limited.
- Events appear in the dashboard.
- Errors are grouped and investigated.
- Performance measurements are visible.
- Uptime checks execute on schedule.
- Alerts create and resolve incidents.
- Notifications work.
- Data retention and deletion are operational.
- Self-hosted installation and upgrades are documented and tested.
- Cross-tenant isolation tests pass.
- CI validates linting, types, tests and builds.

## 17. Future expansion

After Observability MVP:

1. GitHub, Vercel, Cloudflare and payment integrations.
2. Portfolio dashboard and product-level aggregation.
3. Revenue, expense and profitability reporting.
4. Goals, roadmap and experiment tracking.
5. AI-assisted analysis with evidence and confidence.
6. OpenTelemetry Protocol ingestion.
7. Python and mobile SDKs.
8. Community connector ecosystem.
9. Hosted cloud plans and advanced team capabilities.
</content>
