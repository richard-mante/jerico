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

## OpenTelemetry Collector example

The Collector's current HTTP exporter is named `otlp_http`. Set `encoding: json` because Jerico currently accepts OTLP JSON, and set `compression: none`: the ingestion service currently expects a directly readable JSON request body and does not decompress gzip payloads.

```yaml
receivers:
  otlp:
    protocols:
      grpc:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    send_batch_size: 20
    send_batch_max_size: 50
    timeout: 5s

exporters:
  otlp_http/jerico:
    endpoint: https://INGEST_HOST
    encoding: json
    compression: none
    timeout: 10s
    headers:
      Authorization: "Bearer ${env:JERICO_INGEST_TOKEN}"
    retry_on_failure:
      enabled: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp_http/jerico]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp_http/jerico]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp_http/jerico]
```

Replace `INGEST_HOST` with the host for the Jerico ingestion service and provide `JERICO_INGEST_TOKEN` through the Collector's secret/environment mechanism. The exporter appends the signal paths to the base endpoint. Keep batches conservative: Jerico rejects raw bodies over 96 KiB or requests that normalize to more than 100 telemetry points. Collector batch counts do not guarantee a byte-size ceiling, so tune the batch processor to the shape and size of your telemetry and monitor exporter rejections.

This example uses the stable `otlp_http` component name and the exporter's JSON encoding option. See the [OpenTelemetry Collector OTLP HTTP exporter documentation](https://github.com/open-telemetry/opentelemetry-collector/tree/main/exporter/otlphttpexporter) and the [OTLP exporter protocol specification](https://opentelemetry.io/docs/specs/otel/protocol/exporter/) for version-specific configuration details.

## Normalization

- Resource and instrumentation-scope attributes are retained with `resource.` and `scope.` prefixes.
- Log records become Jerico `log` events. Severity is normalized to `debug`, `info`, `warn`, `error`, or `fatal`; trace/span IDs and severity metadata are retained as attributes.
- Spans become Jerico `span` events. Start time becomes the event timestamp, duration becomes milliseconds, and trace/span/parent IDs, kind, status, span attributes, plus bounded serialized span events and links are retained.
- Gauge and sum data points become `metric` events, with aggregation temporality and monotonicity retained. Histogram and exponential-histogram points emit count and sum metrics while retaining bounded bucket metadata; summary points emit count, sum, and quantile metrics.
- OTLP nanosecond timestamps are converted to ISO-8601 timestamps. Attribute values are normalized to Jerico's scalar attribute model; arrays and key/value lists are serialized as bounded JSON strings.

## Limits and credential scope

- Maximum raw request size: 96 KiB.
- Maximum normalized events per request: 100. Split larger exports into smaller requests.
- Public credentials retain their existing restricted scope. Logs and spans, and non-allowlisted metrics, require a secret server-side credential.
- An optional `Idempotency-Key` is forwarded to the durable ingestion outbox. Exporters should use a stable key for retries of the same serialized batch.
- Requests without an idempotency key use the existing at-least-once queue behavior; configure exporter retries accordingly.

The adapter currently accepts OTLP HTTP/JSON only. It does not yet implement OTLP protobuf, OTLP/gRPC, exemplars, histogram bucket expansion into individual bucket metrics, or partial rejection of individual records. Do not interpret the presence of these endpoints as full OpenTelemetry Collector compatibility or production validation.
