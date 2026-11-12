# Architecture decision: provider-neutral durable queue

- **Status:** Implemented in stages; runtime validation pending
- **Date:** 2026-11-12
- **Decision owners:** Jerico maintainers

## Context

Jerico's ingestion, uptime, and notification services currently publish directly to Cloudflare Queue bindings. The API and ingest code use a small `send(message)` shape, but the runtime configuration, queue consumers, retry policy, and dead-letter handling are Cloudflare-specific. This is not sufficient for a self-hosted release.

The ingestion API already has a PostgreSQL idempotency outbox for requests with an idempotency key. Notifications also have a PostgreSQL outbox/reconciliation path. Uptime scheduling claims work in PostgreSQL before publishing. These are useful correctness foundations, but they do not yet provide one portable queue runtime for every job type.

## Decision

Use a **PostgreSQL-backed durable queue as the first self-hosted adapter**, while keeping Cloudflare Queues as the managed-hosting adapter.

This avoids requiring self-hosters to provision a second stateful broker before they can run Jerico. PostgreSQL is already mandatory and owns the durable business state. The queue adapter must nevertheless remain replaceable so deployments that outgrow PostgreSQL polling can adopt NATS JetStream or another broker without changing product services.

Do not couple product services to Cloudflare's `Queue`, `MessageBatch`, or `Message` types. Product services publish typed job envelopes through a provider-neutral port. Runtime adapters own polling, acknowledgements, retry scheduling, visibility leases, and dead-letter transitions.

## Required queue contract

The shared contract should provide:

- `publish(queueName, envelope, options)`: durable acceptance with a stable message ID and optional deduplication key.
- `claim(queueName, workerId, limit, visibilityTimeout)`: atomically lease available messages; PostgreSQL implementation must use `FOR UPDATE SKIP LOCKED`.
- `ack(messageId, leaseToken)`: acknowledge only the active lease.
- `retry(messageId, leaseToken, delay, errorCode)`: release the lease and schedule bounded retry with backoff.
- `deadLetter(messageId, leaseToken, errorCode)`: atomically move terminal work to a queryable dead-letter state.
- `extendLease(messageId, leaseToken, visibilityTimeout)`: optional for long-running handlers.

Every claim must have a fresh opaque lease token. A stale worker must not acknowledge, retry, or dead-letter a message after another worker has reclaimed it. Queue message IDs and idempotency keys must remain stable across retries.

## PostgreSQL adapter model

Use a dedicated queue table rather than overloading domain outbox tables. Suggested fields:

- `id` UUID primary key; `queue_name`; `payload` JSONB; `deduplication_key` nullable.
- `status`: `available`, `leased`, `completed`, or `dead_lettered`.
- `available_at`; `lease_token`; `lease_expires_at`; `attempts`; `max_attempts`.
- `last_error_code`; `created_at`; `updated_at`; `completed_at`.

Add a partial unique index for non-null deduplication keys while messages are active, an index for claimable work (`queue_name, available_at, created_at`), and an index for expired leases. Claim work in a short transaction with `SKIP LOCKED`; never hold a database transaction open while executing a handler or making a network call.

Expired leases return to the available state or move to dead letter when the attempt budget is exhausted. Use bounded payload size, bounded error codes, and retention cleanup for completed/dead-letter records. Do not log payloads or secrets by default.

## Hosted adapter

Keep Cloudflare Queues as the managed adapter. It must implement the same service-level semantics as far as the provider permits. Existing Workers can continue using Cloudflare's native batch delivery internally; the provider-specific batch API must not leak into domain services.

During migration, keep the current PostgreSQL domain outboxes as the source of truth and bridge them into the selected adapter. Do not dual-publish the same job to both adapters. A deployment must select exactly one active adapter.

## Job envelope

All queue envelopes are versioned and validated at the boundary. Each envelope includes:

- `schemaVersion`
- stable `messageId`
- bounded `type`
- creation/acceptance timestamp
- tenant and resource identity where applicable
- typed payload

Handlers must be idempotent. External side effects should use provider idempotency keys when supported. Database callbacks must be fenced by lease tokens or domain-specific generation tokens.

## Rollout sequence

1. Define provider-neutral ports and versioned job contracts without changing current production routing.
2. Implement PostgreSQL queue schema, migrations, claim/lease/ack/retry/dead-letter operations, and a standalone Node worker process.
3. Add the Cloudflare adapter behind the same port; keep the existing Worker consumer as the managed runtime until parity is demonstrated.
4. Bridge telemetry, uptime, and notification outboxes to the selected adapter one job family at a time. Preserve stable IDs and existing fencing.
5. Add Docker Compose services, health/readiness checks, graceful shutdown, queue metrics, and backup/restore documentation.
6. Run migration and failure-injection validation before enabling the self-hosted adapter for real traffic.

## Operational requirements

Expose queue depth by queue/status, oldest available age, expired lease count, attempts, dead-letter count, handler latency, publish failures, and retry rate. Alert on sustained queue age and dead-letter growth. Provide authenticated inspection and replay tools with explicit operator action; never silently replay poison messages.

The self-hosted runtime must document database sizing, connection-pool limits, polling intervals, batch sizes, payload limits, retention, backup/restore, and upgrade ordering. PostgreSQL queue load must be benchmarked against telemetry ingest volume before claiming high-scale suitability.

## Consequences

- Self-hosted MVP requires PostgreSQL only as its durable broker, reducing operational dependencies.
- Queue polling adds database load and must be bounded, indexed, and benchmarked.
- Cloudflare remains the managed-hosting implementation; no production routing changes are part of this decision.
- Existing ingestion and notification outboxes remain in place during the migration and are not deleted until parity and recovery guarantees are demonstrated.


## Invalid-message quarantine

Queue consumers must validate message schema/version before processing. The provider-neutral `QueueDelivery.deadLetter(errorCode)` action is used for permanently invalid or unprocessable envelopes instead of acknowledging and silently discarding them. The PostgreSQL adapter immediately marks the active lease dead-lettered with a bounded error code. The Cloudflare adapter requests immediate retry so the configured `max_retries` policy routes the message to its configured dead-letter queue. Provider-specific timing differs, but the message is not acknowledged as successful. Telemetry DLQ inspection/replay remains operator-managed in the managed Cloudflare deployment; the self-hosted API exposes authenticated DLQ inspection/replay.
