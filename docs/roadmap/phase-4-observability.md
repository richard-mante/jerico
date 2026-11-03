# Phase 4 — Observability query API (first slice)

## Scope

This first Phase 4 slice makes all five current telemetry types queryable by an authenticated organization member and adds a live project explorer. It deliberately uses real API responses and does not insert mock telemetry.

## Endpoints

All routes require a valid Better Auth session and membership in the selected organization. The project is looked up using both its ID and the authorized organization ID before ClickHouse is queried.

- `GET /api/v1/projects/:projectId/telemetry/events`
- `GET /api/v1/projects/:projectId/telemetry/errors`
- `GET /api/v1/projects/:projectId/telemetry/logs`
- `GET /api/v1/projects/:projectId/telemetry/metrics`
- `GET /api/v1/projects/:projectId/telemetry/spans`
- `GET /api/v1/projects/:projectId/telemetry/overview`

Supported query parameters:

| Parameter | Behavior |
| --- | --- |
| `from` | Inclusive ISO timestamp; defaults to one hour before `to` |
| `to` | Inclusive ISO timestamp; defaults to current server time |
| `environmentId` | Optional environment filter; validated against the same project and organization |
| `limit` | 1–100; defaults to 50 |
| `cursor` | Opaque cursor returned by the previous page |

Time ranges are limited to 31 days and cannot extend more than one minute into the future. Results are ordered newest first by timestamp and event ID. The API fetches one extra row to determine whether another page exists. The overview endpoint returns total counts for events, errors, logs, metrics, and spans, plus the latest event timestamp.

## Security and query behavior

- The organization and project identifiers are always taken from the authenticated request context and the verified project row, never accepted as arbitrary ClickHouse scope.
- Every ClickHouse query filters by both `organization_id` and `project_id`; environment filters are additionally validated in PostgreSQL before use.
- Values are passed using ClickHouse query parameters. Only the configured database/table identifiers are interpolated, after strict identifier validation.
- ClickHouse credentials stay in API Worker environment secrets and are never returned to the client.
- ClickHouse error details are logged server-side in bounded form and not forwarded to the browser.
- If ClickHouse is not configured, the endpoint returns HTTP 503. Query failures return HTTP 502.
- No direct ClickHouse credentials or SQL access is exposed to dashboard clients.

## API Worker configuration

Set these values in local `apps/api/.dev.vars` or the deployed API Worker environment:

- `CLICKHOUSE_URL`
- `CLICKHOUSE_DATABASE` (defaults to `jerico`)
- `CLICKHOUSE_TABLE` (defaults to `telemetry_events`)
- `CLICKHOUSE_TOKEN`, or `CLICKHOUSE_USERNAME` and `CLICKHOUSE_PASSWORD`

Use secrets for credentials in deployed environments. Do not commit actual tokens/passwords.

## Web dashboard first slice

The web application now has a project observability route at `/dashboard/projects/:projectId/observability`, linked from the project list. It reads the signed-in user's organizations, lets the user select an organization, loads that project's environments, and calls the authenticated overview and telemetry list APIs. It includes:
- Overview counts for all five telemetry types.
- Environment and time-range filters (1 hour, 24 hours, 7 days, 30 days).
- Tabs for events, errors, logs, metrics, and spans.
- Newest-first signal rows and cursor-based Load more.
- Loading, empty, unauthenticated, and API error states.

The page does not yet show charts, grouped error details/stack traces, metric visualizations, span waterfalls, or log severity-specific controls. It is a functional first explorer, not the finished observability UI.

## Tests and validation

The query adapter has unit coverage for time-range bounds, page limits, opaque cursor handling, parameter binding, and identifier injection rejection. These tests have been authored but not executed in this environment. Route-level tenant isolation and ClickHouse SQL behavior still require integration tests against PostgreSQL and ClickHouse. Counts can temporarily include duplicate queue deliveries until ClickHouse ReplacingMergeTree background merges complete; they are not strict real-time unique-event counts.

## Next slice

Add route-level authorization tests and verify ClickHouse SQL against a real instance. Then expand the explorer with event catalogue/time-series, error grouping and stack traces, metric charts, span waterfalls, and structured log detail before calling Phase 4 complete.


## Error grouping API slice

The project API now exposes `GET /api/v1/projects/:projectId/telemetry/errors/groups`. It returns a bounded list of groups for the selected time window and optional environment, with a stable query fingerprint derived from the error name and message, occurrence count, first/last seen timestamps, latest message, and latest event ID. The query always scopes by authenticated organization, verified project, and (when supplied) a PostgreSQL-validated environment. The fingerprint is a query-time grouping key, not a persisted issue identity; changes in message text create separate groups. This endpoint currently returns at most 100 groups and does not yet implement issue lifecycle actions or stack-trace aggregation.
