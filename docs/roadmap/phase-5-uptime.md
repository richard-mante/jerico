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
