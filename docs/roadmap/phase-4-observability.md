# Phase 4 — Observability query API (first slice)

## Scope

This first backend slice makes ingested events, errors, and logs queryable by an authenticated organization member. It deliberately does not add mock data or pretend that metrics and traces are already supported by the dashboard.

## Endpoints

All routes require a valid Better Auth session and membership in the selected organization. The project is looked up using both its ID and the authorized organization ID before ClickHouse is queried.

- `GET /api/v1/projects/:projectId/telemetry/events`
- `GET /api/v1/projects/:projectId/telemetry/errors`
- `GET /api/v1/projects/:projectId/telemetry/logs`

Supported query parameters:

| Parameter | Behavior |
| --- | --- |
| `from` | Inclusive ISO timestamp; defaults to one hour before `to` |
| `to` | Inclusive ISO timestamp; defaults to current server time |
| `environmentId` | Optional environment filter; validated against the same project and organization |
| `limit` | 1–100; defaults to 50 |
| `cursor` | Opaque cursor returned by the previous page |

Time ranges are limited to 31 days and cannot extend more than one minute into the future. Results are ordered newest first by timestamp and event ID. The API fetches one extra row to determine whether another page exists.

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

## Tests and validation

The query adapter has unit coverage for time-range bounds, page limits, opaque cursor handling, parameter binding, and identifier injection rejection. These tests have been authored but not executed in this environment. Route-level tenant isolation and ClickHouse SQL behavior still require integration tests against PostgreSQL and ClickHouse.

## Next slice

Add the project overview aggregates and metrics/spans queries, then wire real event/error/log views into the web dashboard with loading, empty, error, time-range, and environment states. Add route-level authorization tests before calling Phase 4 complete.
