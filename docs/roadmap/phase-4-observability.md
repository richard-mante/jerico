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

The page now displays query-time grouped errors with occurrence counts, first/last seen timestamps, latest message, and latest event ID. It still does not show stack traces, persisted issue lifecycle actions, charts, metric visualizations, span waterfalls, or log severity-specific controls. It is a functional first explorer, not the finished observability UI.

## Tests and validation

The query adapter has unit coverage for time-range bounds, page limits, opaque cursor handling, parameter binding, and identifier injection rejection. These tests have been authored but not executed in this environment. Route-level tenant isolation and ClickHouse SQL behavior still require integration tests against PostgreSQL and ClickHouse. Counts can temporarily include duplicate queue deliveries until ClickHouse ReplacingMergeTree background merges complete; they are not strict real-time unique-event counts.

## Next slice

Add route-level authorization tests and verify ClickHouse SQL against a real instance. Then expand the explorer with event catalogue/time-series, error grouping and stack traces, metric charts, span waterfalls, and structured log detail before calling Phase 4 complete.


## Error grouping API slice

The project API now exposes `GET /api/v1/projects/:projectId/telemetry/errors/groups`. It returns a bounded list of groups for the selected time window and optional environment, with a stable query fingerprint derived from the error name and message, occurrence count, first/last seen timestamps, latest message, and latest event ID. The query always scopes by authenticated organization, verified project, and (when supplied) a PostgreSQL-validated environment. The fingerprint is a query-time grouping key, not a persisted issue identity; changes in message text create separate groups. This endpoint currently returns at most 100 groups and does not yet implement issue lifecycle actions or stack-trace aggregation.


## Grouped errors dashboard slice

The Errors tab calls the dedicated `/telemetry/errors/groups` endpoint and renders each group with its name, latest message, occurrence count, first/last seen times, and latest event ID. The current endpoint returns at most 100 groups; there is no group pagination or issue lifecycle workflow yet. The fingerprint remains query-time and is derived from error name + message.


## Metric time-series slice

The API exposes `GET /api/v1/projects/:projectId/telemetry/metrics/series`. It validates organization membership, project ownership, and optional environment ownership before querying ClickHouse. It aggregates non-null metric values into average/minimum/maximum/sample-count buckets. Bucket sizes are selected from a fixed allowlist based on the requested time range (1, 15, 60, or 360 minutes). The query is bounded to the eight most frequently sampled metric names and 1,200 result rows. The dashboard Metrics tab renders one responsive SVG line chart per returned metric with latest average, sample count, and average range. This is a first overview, not yet a full metric explorer: unit metadata, percentile aggregation, metric selection, and drill-down are not included.


## Span trace waterfall slice

The Traces tab now groups the currently loaded span rows by `attributes.traceId`. When `traceId` is absent, each span is shown as a standalone span rather than being incorrectly joined to unrelated spans. Each group displays span names, optional span IDs, parent-span indication, timestamp-relative bars, and duration in milliseconds (the existing SDK `span()` contract stores duration in `value`). The Node SDK now provides `startSpan()` and `withSpan()` helpers that generate trace/span IDs, measure duration, and record success/error status. Pass a parent span context explicitly to nested spans to populate `parentSpanId`; framework/async context propagation is not automatic. The waterfall remains limited to currently loaded rows, and manually emitted spans without IDs remain standalone. Load more can extend the visible span set.


## Error stack trace details

The grouped-error query now extracts the latest event's `attributes.stack` value from the stored JSON attributes, and the Errors tab exposes it in a collapsed, scrollable text disclosure. The stack is rendered as text (not HTML). Groups without a stack trace simply omit the disclosure. This shows the latest stack only; stack-based grouping, occurrence-by-occurrence history, and issue lifecycle actions remain future work.


## Structured log severity filters

The Node SDK now supports `logWithLevel(level, name, message, attributes)` with `debug`, `info`, `warn`, `error`, and `fatal`. Existing `log()` calls remain compatible and default to `info`. The API accepts an optional `level` query parameter on the logs route, validates it against the supported set, and filters ClickHouse rows using the JSON `attributes.level` value. Historical logs without a level are treated as `info`. The dashboard exposes a severity selector on the Logs tab and carries the filter into pagination. Browser SDK log submission remains prohibited because public keys cannot submit logs.


## SDK trace context helpers

`@jerico/sdk-core` now provides `startSpan(name, attributes?, parentContext?)` and `withSpan(name, operation, attributes?, parentContext?)`. Root spans create a trace ID; child spans reuse the parent trace ID and store the parent's span ID. `withSpan` records elapsed milliseconds in the existing span `value` field and writes `status: ok|error`. Context is passed explicitly by the caller; no global async context or automatic HTTP framework instrumentation is installed. The browser SDK blocks these server-only span methods.


## Event catalogue

The API exposes `GET /api/v1/projects/:projectId/telemetry/events/catalogue`, returning up to 100 event names ranked by occurrence count for the selected time range and optional environment. Each summary includes count, last-seen timestamp, and latest event ID. The Events tab now displays this catalogue with relative count bars. Counts can include duplicate queue deliveries until ClickHouse `ReplacingMergeTree` background merges complete; this is not a strict real-time unique count. Raw event detail drill-down and catalogue pagination remain future work.


## Event detail disclosure

Each event catalogue row now includes the latest event message and up to 4 KiB of the latest event's serialized attributes. The Events tab exposes those fields in a collapsed, scrollable text disclosure, alongside the latest event ID. The payload is truncated at the query layer to bound response size and rendered as text. This is a latest-occurrence preview, not an event search/detail API; older occurrences and full payload retrieval remain future work.


## Event volume time series

The API exposes `GET /api/v1/projects/:projectId/telemetry/events/series`, aggregating event counts into fixed 1/15/60/360-minute buckets based on the selected time range. The query is scoped by organization, project, optional verified environment, and time window, and returns up to eight most frequently sampled event names with at most 1,200 bucket rows. The Events tab now renders responsive SVG volume charts above the top-event catalogue. Counts may include duplicate queue deliveries until ClickHouse background merges complete.


## Error group lifecycle

Error group status is persisted in PostgreSQL per project/fingerprint with `open`, `resolved`, and `ignored` states. The authenticated group query merges saved status into ClickHouse-derived groups; groups without a state default to `open`. `POST /api/v1/projects/:projectId/telemetry/errors/groups/:fingerprint/status` allows only organization owners/admins to update status. Members can read but cannot change lifecycle state. This is a lightweight state overlay: occurrence counts and grouping remain query-time in ClickHouse, and there is no assignment, comments, notifications, or audit history yet.


## Error occurrence drill-down

The API exposes `GET /api/v1/projects/:projectId/telemetry/errors/groups/:fingerprint/occurrences` with the same tenant/project/environment/time-range checks and opaque keyset pagination as other telemetry lists. The fingerprint filter is bound as a ClickHouse parameter and matches the same `cityHash64(name, message)` grouping key used by the catalogue. The Errors tab can expand a group to load the latest 20 occurrences with timestamps, event IDs, and messages. The first UI slice does not yet expose occurrence pagination or full per-occurrence stack/attribute details.


## Route authorization test slice

`apps/api/src/index.test.ts` now exercises the Hono routes with mocked session/database adapters: unauthenticated requests are rejected before tenant data access, organization members cannot mutate error-group status, a project outside the active organization returns 404, and an owner can update status. These are route-level authorization tests with mocked persistence, not PostgreSQL integration tests. ClickHouse SQL still requires execution against a real ClickHouse instance.


## ClickHouse integration validation harness

A gated integration suite now exercises the actual ClickHouse SQL for overview counts, grouped errors and latest stack extraction, fingerprint occurrence filtering, event catalogue/details, event time series, metric aggregation, and structured log severity. It creates a unique temporary table and drops it after the suite. The test is skipped unless `CLICKHOUSE_TEST_URL` is set.

Local run:

```bash
docker compose -f docker-compose.integration.yml up -d --wait
CLICKHOUSE_TEST_URL=http://127.0.0.1:8123 CLICKHOUSE_TEST_DATABASE=jerico CLICKHOUSE_TEST_USERNAME=jerico CLICKHOUSE_TEST_PASSWORD=jerico_test pnpm --filter @jerico/api test:integration
docker compose -f docker-compose.integration.yml down -v
```

CI now provisions the same ClickHouse service and runs the integration suite. The repository's hosted runner allocation issue has prevented confirming this job so far; the suite is authored and wired into CI but has not been observed passing.


## Trace detail drill-down

The Traces tab can now retrieve all spans for an individual trace independently of the initial project-wide span page. It reuses the authenticated project spans endpoint with a `traceId` filter. The API binds the trace ID as a ClickHouse query parameter and continues to enforce the existing organization, project, environment, time-range, and cursor constraints. Trace IDs are bounded to 1–256 characters. The dashboard loads up to 100 spans per request, renders span IDs, parent indicators, timestamps, messages, and durations, and supports cursor-based loading of additional spans. This avoids treating the first 50 project-wide rows as the complete trace. It remains a span detail view rather than a full distributed-trace service map or cross-project trace search.


## Browser Core Web Vitals

The browser SDK can opt into `captureWebVitals: true`. It records TTFB and FCP when the browser exposes the relevant timing entries, tracks LCP and CLS, and estimates INP from interaction-duration entries. LCP, CLS, and INP are finalized when the page becomes hidden or closes, then a best-effort flush is started. Public ingestion credentials remain restricted: they may submit events, errors, and only five named metric series (`web.vitals.lcp`, `web.vitals.cls`, `web.vitals.inp`, `web.vitals.fcp`, `web.vitals.ttfb`). Custom browser metrics, logs, and spans remain forbidden. This is an initial native PerformanceObserver implementation; cross-browser comparison with the official `web-vitals` library and SPA route attribution remain future validation/work.


## Metric percentiles and Core Web Vitals ratings

Metric-series buckets now include average, minimum, maximum, p50, p75, p95, sample count, and the latest observed `unit` and `rating` attributes. The dashboard shows percentile summaries and units for the latest bucket. Browser Web Vitals metrics carry their unit (`ms` or `score`) and a rating using the published thresholds: LCP 2.5s/4s, INP 200ms/500ms, CLS 0.1/0.25, FCP 1.8s/3s, and TTFB 0.8s/1.8s. Percentiles are calculated across the metric samples in each bucket; they are not yet service-level percentile aggregations across request traces, and the dashboard remains limited to the top eight metric names.
