import type { TelemetryEvent } from "@jerico/contracts";

type JsonObject = Record<string, unknown>;
type OtlpAttribute = { key?: unknown; value?: unknown };

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function scalar(value: unknown): string | number | boolean | null {
  const item = object(value);
  if ("stringValue" in item) return String(item.stringValue).slice(0, 2048);
  if ("boolValue" in item) return Boolean(item.boolValue);
  if ("intValue" in item) {
    const number = Number(item.intValue);
    return Number.isSafeInteger(number) ? number : String(item.intValue).slice(0, 2048);
  }
  if ("doubleValue" in item) {
    const number = Number(item.doubleValue);
    return Number.isFinite(number) ? number : null;
  }
  if ("bytesValue" in item) return String(item.bytesValue).slice(0, 2048);
  if ("arrayValue" in item || "kvlistValue" in item) return JSON.stringify(value).slice(0, 2048);
  return null;
}

function attributes(input: unknown, prefix = ""): Record<string, string | number | boolean | null> {
  if (!Array.isArray(input)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const entry of input as OtlpAttribute[]) {
    if (typeof entry.key !== "string" || !entry.key) continue;
    const key = (prefix + entry.key).slice(0, 128);
    result[key] = scalar(entry.value);
  }
  return result;
}

function timestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  try {
    const millis = Number(BigInt(value) / 1_000_000n);
    if (!Number.isSafeInteger(millis) || millis < 0) return undefined;
    return new Date(millis).toISOString();
  } catch {
    return undefined;
  }
}

function hexId(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]+$/i.test(value) ? value.toLowerCase() : undefined;
}

function mergeAttributes(...values: Record<string, string | number | boolean | null>[]) {
  return Object.assign({}, ...values);
}

function boundedJson(value: unknown, maxLength = 2048): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value).slice(0, maxLength);
  } catch {
    return undefined;
  }
}

function resourceGroups(payload: unknown, signal: "logs" | "traces" | "metrics"): Array<{ resource: JsonObject; scope: JsonObject; data: JsonObject }> {
  const root = object(payload);
  const groups = root.resourceLogs ?? root.resourceSpans ?? root.resourceMetrics;
  if (!Array.isArray(groups)) return [];
  const nestedKey = signal === "logs" ? "scopeLogs" : signal === "traces" ? "scopeSpans" : "scopeMetrics";
  return groups.flatMap((group) => {
    const item = object(group);
    const nested = item[nestedKey];
    if (!Array.isArray(nested)) return [];
    return nested.map((entry) => {
      const scopeGroup = object(entry);
      return {
        resource: object(item.resource),
        scope: object(scopeGroup.scope ?? item.scope ?? item.instrumentationScope),
        data: scopeGroup,
      };
    });
  });
}

function commonAttributes(resource: JsonObject, scope: JsonObject, signal: string) {
  return mergeAttributes(
    attributes(resource.attributes, "resource."),
    attributes(scope.attributes, "scope."),
    { "otel.signal": signal },
  );
}

export function convertOtlp(signal: "logs" | "traces" | "metrics", payload: unknown): TelemetryEvent[] {
  const root = object(payload);
  const rootKey = signal === "logs" ? "resourceLogs" : signal === "traces" ? "resourceSpans" : "resourceMetrics";
  if (!Array.isArray(root[rootKey])) throw new Error("The OTLP payload is missing its " + rootKey + " array.");
  const groups = resourceGroups(payload, signal);
  const events: TelemetryEvent[] = [];
  for (const group of groups) {
    const scope = object(group.data);
    const common = commonAttributes(group.resource, group.scope, signal);
    if (signal === "logs") {
      for (const raw of Array.isArray(scope.logRecords) ? scope.logRecords : []) {
        const record = object(raw);
        const severity = Number(record.severityNumber ?? 0);
        const level = severity >= 21 ? "fatal" : severity >= 17 ? "error" : severity >= 13 ? "warn" : severity >= 9 ? "info" : "debug";
        const body = scalar(record.body);
        const attrs = mergeAttributes(common, attributes(record.attributes), {
          "otel.severity_number": Number.isFinite(severity) ? severity : 0,
          ...(typeof record.severityText === "string" ? { "otel.severity_text": record.severityText.slice(0, 128) } : {}),
          ...(hexId(record.traceId) ? { traceId: hexId(record.traceId)! } : {}),
          ...(hexId(record.spanId) ? { spanId: hexId(record.spanId)! } : {}),
        });
        events.push({
          type: "log",
          name: typeof record.eventName === "string" && record.eventName ? record.eventName.slice(0, 160) : "otel.log",
          ...(timestamp(record.timeUnixNano ?? record.observedTimeUnixNano) ? { timestamp: timestamp(record.timeUnixNano ?? record.observedTimeUnixNano) } : {}),
          ...(body !== null ? { message: String(body).slice(0, 8192) } : {}),
          attributes: { ...attrs, level },
        });
      }
    } else if (signal === "traces") {
      for (const raw of Array.isArray(scope.spans) ? scope.spans : []) {
        const span = object(raw);
        const start = timestamp(span.startTimeUnixNano);
        const end = timestamp(span.endTimeUnixNano);
        const startMs = start ? Date.parse(start) : NaN;
        const endMs = end ? Date.parse(end) : NaN;
        const status = object(span.status);
        events.push({
          type: "span",
          name: typeof span.name === "string" && span.name ? span.name.slice(0, 160) : "otel.span",
          ...(start ? { timestamp: start } : {}),
          ...(Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? { value: endMs - startMs } : {}),
          attributes: mergeAttributes(common, attributes(span.attributes), {
            ...(hexId(span.traceId) ? { traceId: hexId(span.traceId)! } : {}),
            ...(hexId(span.spanId) ? { spanId: hexId(span.spanId)! } : {}),
            ...(hexId(span.parentSpanId) ? { parentSpanId: hexId(span.parentSpanId)! } : {}),
            ...(typeof span.kind === "number" ? { "otel.span_kind": span.kind } : {}),
            ...(typeof status.code === "number" ? { "otel.status_code": status.code } : {}),
            ...(typeof status.message === "string" ? { "otel.status_message": status.message.slice(0, 512) } : {}),
            ...(boundedJson(span.events) ? { "otel.span_events": boundedJson(span.events)! } : {}),
            ...(boundedJson(span.links) ? { "otel.span_links": boundedJson(span.links)! } : {}),
          }),
        });
      }
    } else {
      for (const raw of Array.isArray(scope.metrics) ? scope.metrics : []) {
        const metric = object(raw);
        const name = typeof metric.name === "string" ? metric.name.slice(0, 120) : "otel.metric";
        const description = typeof metric.description === "string" ? metric.description.slice(0, 512) : undefined;
        const unit = typeof metric.unit === "string" ? metric.unit.slice(0, 64) : undefined;
        const data = object(metric.gauge ?? metric.sum ?? metric.histogram ?? metric.exponentialHistogram ?? metric.summary);
        const kind = metric.gauge ? "gauge" : metric.sum ? "sum" : metric.histogram ? "histogram" : metric.exponentialHistogram ? "exponential_histogram" : metric.summary ? "summary" : "unknown";
        const points = Array.isArray(data.dataPoints) ? data.dataPoints : [];
        for (const rawPoint of points) {
          const point = object(rawPoint);
          const pointAttrs = mergeAttributes(common, attributes(point.attributes), {
            "otel.metric_kind": kind,
            ...(description ? { "otel.description": description } : {}),
            ...(unit ? { "otel.unit": unit } : {}),
            ...(typeof data.aggregationTemporality === "number" ? { "otel.aggregation_temporality": data.aggregationTemporality } : {}),
            ...(typeof data.isMonotonic === "boolean" ? { "otel.monotonic": data.isMonotonic } : {}),
            ...(kind === "histogram" && boundedJson(point.bucketCounts) ? { "otel.bucket_counts": boundedJson(point.bucketCounts)! } : {}),
            ...(kind === "histogram" && boundedJson(point.explicitBounds) ? { "otel.explicit_bounds": boundedJson(point.explicitBounds)! } : {}),
            ...(kind === "exponential_histogram" && boundedJson(point.positive) ? { "otel.positive_buckets": boundedJson(point.positive)! } : {}),
            ...(kind === "exponential_histogram" && boundedJson(point.negative) ? { "otel.negative_buckets": boundedJson(point.negative)! } : {}),
            ...(kind === "exponential_histogram" && typeof point.scale === "number" ? { "otel.scale": point.scale } : {}),
            ...(kind === "exponential_histogram" && point.zeroCount !== undefined ? { "otel.zero_count": Number(point.zeroCount) } : {}),
            ...(typeof point.min === "number" ? { "otel.min": point.min } : {}),
            ...(typeof point.max === "number" ? { "otel.max": point.max } : {}),
          });
          const time = timestamp(point.timeUnixNano ?? point.startTimeUnixNano);
          const number = point.asDouble !== undefined ? Number(point.asDouble) : Number(point.asInt);
          if (Number.isFinite(number)) {
            events.push({ type: "metric", name, value: number, ...(time ? { timestamp: time } : {}), attributes: pointAttrs });
          } else if (kind.includes("histogram") || kind === "summary") {
            const count = Number(point.count);
            const sum = Number(point.sum);
            if (Number.isFinite(count)) events.push({ type: "metric", name: name + ".count", value: count, ...(time ? { timestamp: time } : {}), attributes: pointAttrs });
            if (Number.isFinite(sum)) events.push({ type: "metric", name: name + ".sum", value: sum, ...(time ? { timestamp: time } : {}), attributes: pointAttrs });
            if (kind === "summary" && Array.isArray(point.quantileValues)) {
              for (const item of point.quantileValues) {
                const quantile = object(item);
                const value = Number(quantile.value);
                const rank = Number(quantile.quantile);
                if (!Number.isFinite(value) || !Number.isFinite(rank)) continue;
                events.push({
                  type: "metric",
                  name: name + ".quantile",
                  value,
                  ...(time ? { timestamp: time } : {}),
                  attributes: { ...pointAttrs, "otel.quantile": rank },
                });
              }
            }
          }
        }
      }
    }
    if (events.length > 100) throw new Error("OTLP request expands to more than 100 telemetry points; split the export into smaller requests.");
  }
  return events;
}
