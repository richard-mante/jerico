# OpenTelemetry HTTP/JSON ingestion

Jerico accepts OTLP JSON exports through the ingestion service. This is an ingestion adapter: accepted data is normalized into Jerico's existing immutable telemetry envelope and then follows the same credential, project-state, rate-limit, quota, redaction, idempotency-outbox, queue, and ClickHouse pipeline as native SDK events.

## Endpoints

All endpoints require a Jerico bearer ingestion credential and `Content-Type: application/json`.

| Signal | Endpoint |
|---|---|
| Logs | `POST /v1/logs` |
| Traces | `POST /v1/traces` |
| Metrics | `POST /v1/metrics` |

Use the ingestion service base URL, not the management API URL. OTLP/gRPC is not implemented by this adapter.

Example:

```http
POST /v1/traces
Authorization: Bearer jk_sec_...
Content-Type: application/json
Idempotency-Key: exporter-batch-000042
```

The request body is the corresponding OTLP JSON export request (`resourceLogs`, `resourceSpans`, or `resourceMetrics`).

## Normalization

- Resource and instrumentation-scope attributes are retained with `resource.` and `scope.` prefixes.
- Log records become Jerico `log` events. Severity is normalized to `debug`, `info`, `warn`, `error`, or `fatal`; trace/span IDs and severity metadata are retained as attributes.
- Spans become Jerico `span` events. Start time becomes the event timestamp, duration becomes milliseconds, and trace/span/parent IDs, kind, status, and span attributes are retained.
- Gauge and sum data points become `metric` events. Histogram and exponential-histogram points currently emit count and sum metrics when those values are present.
- OTLP nanosecond timestamps are converted to ISO-8601 timestamps. Attribute values are normalized to Jerico's scalar attribute model; arrays and key/value lists are serialized as bounded JSON strings.

## Limits and credential scope

- Maximum raw request size: 96 KiB.
- Maximum normalized events per request: 100. Split larger exports into smaller requests.
- Public credentials retain their existing restricted scope. Logs and spans, and non-allowlisted metrics, require a secret server-side credential.
- An optional `Idempotency-Key` is forwarded to the durable ingestion outbox. Exporters should use a stable key for retries of the same serialized batch.
- Requests without an idempotency key use the existing at-least-once queue behavior; configure exporter retries accordingly.

The adapter currently accepts OTLP HTTP/JSON only. It does not yet implement OTLP protobuf, OTLP/gRPC, exemplars, histogram bucket expansion, temporality conversion, or partial rejection of individual records. Do not interpret the presence of these endpoints as full OpenTelemetry Collector compatibility or production validation.
