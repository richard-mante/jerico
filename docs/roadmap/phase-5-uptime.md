# Phase 5 — Uptime monitoring

## Phase 5A: monitor configuration

The first uptime slice provides project-scoped monitor configuration and history storage. It does not run checks yet.

### API

- `GET /api/v1/projects/:projectId/uptime-monitors`
- `POST /api/v1/projects/:projectId/uptime-monitors`
- `PATCH /api/v1/projects/:projectId/uptime-monitors/:monitorId`
- `DELETE /api/v1/projects/:projectId/uptime-monitors/:monitorId`
- `GET /api/v1/projects/:projectId/uptime-monitors/:monitorId/checks`

Every route requires organization membership and verifies project/monitor ownership. Only owners/admins can create, update, pause, or delete monitors. History reads are available to project members.

### Configuration limits

- HTTP or HTTPS URL, maximum 2,048 characters; URL user-info credentials are rejected.
- GET or HEAD method.
- Interval: 60–86,400 seconds.
- Timeout: 1,000–30,000 milliseconds.
- Expected status: 100–599.
- Check history read is bounded to 1–100 rows.

### Persistence

- `uptime_monitors` stores project-scoped configuration, enabled state, scheduling fields, and last-check summary fields.
- `uptime_check_results` stores status, HTTP status, response time, safe error code, and timestamp.
- Composite foreign keys prevent a monitor/history row from crossing organization/project boundaries.
- Migration: `0005_uptime_monitors.sql`.

### Current limitation

The dashboard explicitly labels this as configuration mode. No scheduled probes, history writes, status calculations, uptime percentages, or incidents are active yet. A monitor being enabled does not mean it has been checked.

## Phase 5B: secure probes — required before outbound requests

The next implementation must add:

1. DNS resolution and rejection of loopback, private, link-local, multicast, reserved, and metadata-service addresses, including IPv4-mapped IPv6.
2. Revalidation of DNS results immediately before connection to mitigate rebinding; do not rely only on URL hostname string checks.
3. Redirects disabled by default. If redirects are supported, cap the count and revalidate every destination and resolved address.
4. Strict HTTP(S), bounded response size, timeout/abort, restricted methods, no user-controlled headers/body, and no credential-bearing URLs.
5. Safe error codes only; never persist response bodies, secrets, or raw internal network errors.
6. Scheduler concurrency/rate limits and deterministic next-check updates.
7. Check history writes, monitor state transitions, and retention policy.

Do not deploy outbound probing until those protections are implemented and tested. The current configuration URL validation is not an SSRF defense and must not be treated as one.


## Phase 5B: scheduled public probes

The probe pipeline is implemented in code but requires Cloudflare queues/secrets to be provisioned and integration-tested.

### Scheduling and delivery

- The API Worker runs a one-minute Cron Trigger, selects due enabled monitors, and atomically claims each by advancing `next_check_at`.
- Claimed monitors are sent to the `jerico-uptime-probes` queue with a unique check ID.
- The Worker consumes probe messages, performs the request, and posts a bounded result to `/internal/uptime-results`.
- The internal callback requires a shared secret of at least 32 characters, uses constant-time comparison, validates a strict result schema, caps payload size at 4 KiB, and stores results idempotently by check ID.
- Queue retries use a 30-second delay and the probe queue has a dead-letter queue.
- The UI only shows Up/Down after a real result is persisted. Queue configuration alone is not presented as a successful check.

### Outbound request security

- The probe runner uses the Worker's global `fetch` only; it does not use `cloudflare:sockets` or direct TCP. The Worker enables the `global_fetch_strictly_public` compatibility flag, which routes global fetch as public Internet traffic.
- Only HTTP(S), GET/HEAD, and ports 80, 443, 8080, and 8443 are accepted.
- IP-literal targets, credentials, localhost/internal/reserved hostname suffixes, and unsupported ports are rejected.
- Redirects are manual, limited to three hops, and every destination is revalidated before following.
- Each request has a 1–30 second timeout. Response bodies are cancelled immediately; no response body or headers are persisted.
- Only HTTP status, response time, and a fixed safe error code are sent to the API. The API retains check results for 30 days and prunes older history daily.

**Critical deployment constraint:** Keep `jerico-worker` on its `workers.dev` hostname with no custom-domain routes, VPC bindings, or private outbound network. The Worker enables `global_fetch_strictly_public` and requires `PROBE_WORKER_HOST` to block requests back to its own hostname. The DNS-rebinding/private-address safety assumption relies on Cloudflare Workerd's default public-only global fetch egress, which filters resolved destinations to publicly routable addresses. Do not enable private-network access on this Worker. Cloudflare documents that private network access is provided through explicit VPC bindings; the probe code deliberately does not use them. If the deployment topology changes, re-review SSRF controls before continuing probes.

### Provisioning

Create both queues:
```bash
pnpm --filter @jerico/api exec wrangler queues create jerico-uptime-probes
pnpm --filter @jerico/worker exec wrangler queues create jerico-uptime-probes-dlq
``

Set the same random secret on API and Worker:
```bash
pnpm --filter @jerico/api exec wrangler secret put UPTIME_RESULTS_SECRET
pnpm --filter @jerico/worker exec wrangler secret put UPTIME_RESULTS_SECRET
pnpm --filter @jerico/worker exec wrangler secret put API_URL
pnpm --filter @jerico/worker exec wrangler secret put PROBE_WORKER_HOST
``

Set `API_URL` to the HTTPS `workers.dev` URL of the Jerico API and `PROBE_WORKER_HOST` to the exact hostname of the probe Worker itself. Provision the API Worker's existing Hyperdrive binding and deploy both Workers. Do not place the probe Worker behind a custom domain or attach a VPC binding.

### Remaining validation

- Provision queues and secrets in a non-production Cloudflare environment.
- Apply migration 0005 and run a real monitor through cron → queue → probe → callback → PostgreSQL history.
- Verify DNS/private address blocking and redirects in the deployed Workerd runtime.
- Verify retries, duplicate callback idempotency, DLQ behavior, paused/deleted monitors, and queue outage recovery.
- Add alert/incident state transitions only after this pipeline is verified.


## Phase 5C: alert rules and incident lifecycle

### Alert rule configuration

Project-scoped alert rules support:
- `error_count`: count error telemetry in a rolling 1–1,440 minute window.
- `uptime_down`: count failed uptime check results in the rolling window. If no check results exist, the evaluator skips the rule instead of treating missing data as recovery.
- `response_time`: calculate the nearest-rank p95 from up to the 10,000 most recent check response-time samples in the rolling window. This is based on uptime probes, not application request spans.

Rules support `gt` and `gte` comparisons, thresholds, 1–10 consecutive minute evaluations, enable/pause, and owner/admin-only create/update/delete. Every evaluation is project- and organization-scoped. Error counts come from ClickHouse (and can temporarily include queue redeliveries until ReplacingMergeTree merges); uptime and response-time signals come from PostgreSQL check history.

### Incident lifecycle

- A breach that satisfies the consecutive-evaluation requirement opens an incident.
- A partial unique index guarantees at most one open/acknowledged incident per alert rule.
- Continued breaches update the active incident's latest value and timestamp.
- Recovery automatically resolves an active incident.
- Organization members can acknowledge or manually resolve incidents; rules remain owner/admin managed.
- Deleting a rule cascades its incident history. Webhook channels, escalation policies, assignments, comments, and an incident audit timeline remain open.

### API

- `GET/POST /api/v1/projects/:projectId/alert-rules`
- `PATCH/DELETE /api/v1/projects/:projectId/alert-rules/:ruleId`
- `GET /api/v1/projects/:projectId/incidents`
- `POST /api/v1/projects/:projectId/incidents/:incidentId/acknowledge`
- `POST /api/v1/projects/:projectId/incidents/:incidentId/resolve`

The API Cron Trigger evaluates enabled rules every minute. Error-count rules require ClickHouse configuration; uptime and response-time rules require persisted probe results. This implementation is authored but still needs runtime validation and alert delivery integrations.

## Phase 5D: verified email notifications

### Channels and verification

- Organization owners/admins can add email notification channels.
- Email addresses are normalized and stored per organization; only a successful one-time verification can activate delivery.
- Verification tokens contain 256 bits of randomness, are stored as SHA-256 hashes, expire after 24 hours, and are cleared after successful verification.
- Owners/admins can resend verification or remove a channel.
- A delivery stores a recipient snapshot so deleting a channel does not erase already-created delivery history.

### Delivery pipeline

- Incident opened, acknowledged, and resolved events create one delivery per verified enabled email channel.
- A unique incident/channel/event index prevents duplicate delivery records for the same lifecycle event.
- The API publishes delivery jobs to the jerico-notifications Cloudflare Queue.
- The Worker sends email through Resend and reports the result to an internal API callback protected by a separate shared secret.
- Resend requests use the delivery ID as an idempotency key so queue redelivery does not intentionally create duplicate emails.
- Queue retries are configured for five attempts with a dead-letter queue. Delivery history records status, worker attempt count, provider message ID, safe error code, and timestamps.
- The dashboard exposes channel verification state and the latest 25 delivery records.

### Configuration and provisioning

Create the notification queue and dead-letter queue:
```bash
pnpm --filter @jerico/api exec wrangler queues create jerico-notifications
pnpm --filter @jerico/worker exec wrangler queues create jerico-notifications-dlq
```

Configure matching NOTIFICATION_DELIVERY_SECRET values on API and Worker (at least 32 random characters). Configure RESEND_API_KEY and EMAIL_FROM on both API (for verification messages) and Worker (for incident messages). Worker also needs the existing public HTTPS API_URL.

Apply migration 0007_email_notification_channels.sql before deploying. The code and queue wiring are authored but not provisioned or runtime-verified.

### Remaining

- Webhook channel support and endpoint verification.
- Delivery preferences by event type, quiet hours, escalation policies, and retry controls.
- Real Resend delivery, queue retry/DLQ, callback idempotency, and database integration verification.