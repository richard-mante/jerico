# Phase 2B — Authenticated Telemetry Ingestion

**Status:** Implementation committed on the Phase 2A feature branch; validation and infrastructure provisioning pending.  
**Endpoint:** `POST /ingest/v1/events`  
**Queue:** Cloudflare Queues (`jerico-telemetry`)  
**Analytics store:** ClickHouse (`jerico.telemetry_events`)

## Request contract

Send a JSON batch with a bearer credential:

```http
POST /ingest/v1/events
Authorization: Bearer jk_pub_...
Content-Type: application/json
```

```json
{
  "events": [
    {
      "type": "event",
      "name": "signup.completed",
      "timestamp": "2026-11-03T09:00:00.000Z",
      "attributes": {
        "method": "email",
        "plan": "starter"
      }
    }
  ]
}
```

Supported event types:
- `event`
- `error`
- `log`
- `metric`
- `span`

Each event requires a name. Optional fields include an ISO timestamp, message, numeric value, and bounded scalar attributes. Unknown fields are rejected. Batches contain 1–100 events. The request body is limited to 96 KiB to leave headroom beneath the Cloudflare Queue message-size limit.

## Authentication and permissions

1. The ingestion service extracts the bearer credential and hashes it with SHA-256.
2. It looks up the hash in PostgreSQL through Hyperdrive (or a direct database URL in local development).
3. It rejects unknown and revoked credentials.
4. It derives organization, project, environment, and credential identity from the database row. Tenant identifiers in the client payload are not accepted.
5. Public keys (`jk_pub_`) may submit only `event` and `error` records.
6. Secret keys (`jk_sec_`) may submit all supported record types and must remain server-side.
7. If configured, a Cloudflare Rate Limiting binding applies a per-credential request limit. Production mode fails closed when this binding is missing.
8. The service redacts common secret/PII patterns, then enqueues a trusted envelope.

The API returns HTTP 202 only after the queue accepts the message. It does not mean the event has already been written to ClickHouse.

## Queue and processing

The queue envelope contains:
- Schema version and request ID.
- Credential ID.
- Trusted organization, project, and environment IDs.
- Acceptance timestamp.
- Redacted telemetry events.

The consumer writes batches to ClickHouse using the HTTP `JSONEachRow` interface. It acknowledges queue messages only after ClickHouse returns success. Failed writes are retried with a delay; after the configured retry count, Cloudflare Queues moves messages to the configured dead-letter queue. Malformed queue envelopes are acknowledged and discarded.

## ClickHouse table

Apply `infrastructure/clickhouse/init/001_telemetry_events.sql` to the target ClickHouse database. The initial table includes tenant/project/environment dimensions, event type, name, message, value, attributes, credential ID, and request ID.

Retention defaults:
- Logs: 7 days.
- Other telemetry types: 30 days.

These are initial defaults, not yet user-configurable retention policies.

## Cloudflare provisioning

Before deploying the Workers:

1. Create the queues `jerico-telemetry` and `jerico-telemetry-dlq` using Wrangler.
2. Create a Hyperdrive configuration for the PostgreSQL database and add its returned ID as the `HYPERDRIVE` binding in `apps/ingest/wrangler.jsonc`.
3. Create a Cloudflare Rate Limiting binding named `INGEST_RATE_LIMITER` with an initial per-credential policy (for example, 120 requests per 60 seconds). Confirm the selected limit in load tests before production.
4. Set `APP_ENV=production` for the production Worker.
5. Configure ClickHouse URL and credentials on `apps/worker` using Worker variables/secrets. Never commit credentials.
6. Apply the ClickHouse SQL schema.
7. Deploy the consumer Worker before enabling the ingestion Worker.

The exact Hyperdrive ID and Rate Limiting namespace are account-specific and must not be fabricated or committed as placeholders.

## Local/self-hosted qualification

The current ingestion runtime is implemented as a Cloudflare Worker and uses the Cloudflare Queue binding. The message envelope and ClickHouse HTTP writer are narrow interfaces, but a self-hosted HTTP runtime and durable queue adapter (for example, a Docker Compose broker consumer) are **not implemented in this milestone**. Self-hosted deployment remains a release requirement and must not be represented as supported yet.

## Security and reliability limitations

- Redaction covers sensitive attribute names, email addresses, bearer tokens, and JWT-like values. It is a safety layer, not a guarantee that arbitrary user data is anonymous.
- The rate limiter is optional in local development and mandatory when `APP_ENV=production`; the Cloudflare binding must actually be provisioned.
- Daily/monthly plan quotas, billing metering, adaptive backpressure, sampling, and per-tenant retention configuration are not implemented yet.
- Queue delivery is at-least-once. A worker crash after a ClickHouse write but before queue acknowledgement can produce duplicate rows. Query/aggregation layers must account for this; an idempotent event ID strategy is a follow-up.
- There is no dashboard query API or SDK in this milestone.
- Database, queue, and ClickHouse integration tests and deployment validation are still required.

## Acceptance checks

- [ ] Valid active public credential can submit events/errors.
- [ ] Public credential cannot submit logs, metrics, or spans.
- [ ] Valid active secret credential can submit every supported type.
- [ ] Invalid and revoked credentials are rejected.
- [ ] Tenant/project/environment identity always comes from the credential record.
- [ ] Malformed JSON, invalid schemas, oversized bodies, and excessive batches are rejected.
- [ ] Sensitive fields are redacted before queueing.
- [ ] Configured rate limit returns HTTP 429 and retry guidance.
- [ ] Queue outage returns a retryable 503.
- [ ] Consumer retries ClickHouse failures and routes exhausted messages to the DLQ.
- [ ] ClickHouse writes preserve tenant dimensions and apply retention.
- [ ] PostgreSQL, queue, and ClickHouse integration tests pass before production use.
