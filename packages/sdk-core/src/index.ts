export type TelemetryType = "event" | "error" | "log" | "metric" | "span";
export type TelemetryValue = string | number | boolean | null;
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type SpanContext = { traceId: string; spanId: string };
export type SpanHandle = { context: SpanContext; end(attributes?: Record<string, TelemetryValue>): boolean };
export type TelemetryEvent = {
  type: TelemetryType;
  name: string;
  timestamp?: string;
  message?: string;
  value?: number;
  attributes?: Record<string, TelemetryValue>;
};

export type JericoClientOptions = {
  apiKey: string;
  endpoint: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  fetch?: typeof fetch;
  onError?: (error: Error) => void;
};

export class JericoHttpError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "JericoHttpError";
  }
}

const DEFAULT_FLUSH_INTERVAL = 10_000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_QUEUE_SIZE = 5_000;

export class JericoClient {
  private queue: TelemetryEvent[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;
  private inFlightCount = 0;
  private timerBlocked = false;
  private closed = false;
  private readonly fetcher: typeof fetch;
  private readonly endpoint: string;
  private readonly maxBatchSize: number;
  private readonly maxQueueSize: number;

  constructor(private readonly options: JericoClientOptions) {
    if (!options.apiKey.trim()) throw new Error("A Jerico ingestion API key is required.");
    let endpoint: URL;
    try { endpoint = new URL(options.endpoint); } catch { throw new Error("A valid absolute ingestion endpoint is required."); }
    if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") throw new Error("The ingestion endpoint must use HTTP or HTTPS.");
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_BATCH_SIZE;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_QUEUE_SIZE;
    if (!Number.isInteger(this.maxBatchSize) || this.maxBatchSize < 1 || this.maxBatchSize > 100) {
      throw new Error("maxBatchSize must be an integer between 1 and 100.");
    }
    if (!Number.isInteger(this.maxQueueSize) || this.maxQueueSize < this.maxBatchSize) {
      throw new Error("maxQueueSize must be an integer greater than or equal to maxBatchSize.");
    }
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    const interval = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL;
    if (interval > 0) this.timer = setInterval(() => {
      if (!this.timerBlocked) void this.flushBatch().catch(this.reportError);
    }, interval);
  }

  track(name: string, attributes?: Record<string, TelemetryValue>): boolean {
    return this.enqueue({ type: "event", name, attributes });
  }

  captureError(error: Error, attributes?: Record<string, TelemetryValue>): boolean {
    return this.enqueue({
      type: "error",
      name: error.name || "Error",
      message: error.message.slice(0, 8192),
      attributes: { ...attributes, ...(error.stack ? { stack: error.stack.slice(0, 2048) } : {}) },
    });
  }

  log(name: string, message: string, attributes?: Record<string, TelemetryValue>): boolean {
    return this.logWithLevel("info", name, message, attributes);
  }

  logWithLevel(level: LogLevel, name: string, message: string, attributes?: Record<string, TelemetryValue>): boolean {
    if (!["debug", "info", "warn", "error", "fatal"].includes(level)) {
      throw new Error("Log level must be debug, info, warn, error, or fatal.");
    }
    return this.enqueue({ type: "log", name, message, attributes: { ...attributes, level } });
  }

  metric(name: string, value: number, attributes?: Record<string, TelemetryValue>): boolean {
    if (!Number.isFinite(value)) throw new Error("Metric value must be finite.");
    return this.enqueue({ type: "metric", name, value, attributes });
  }

  span(name: string, valueMs: number, attributes?: Record<string, TelemetryValue>): boolean {
    if (!Number.isFinite(valueMs) || valueMs < 0) throw new Error("Span duration must be a non-negative finite number.");
    return this.enqueue({ type: "span", name, value: valueMs, attributes });
  }

  startSpan(name: string, attributes?: Record<string, TelemetryValue>, parentContext?: SpanContext): SpanHandle {
    const context: SpanContext = { traceId: parentContext?.traceId ?? crypto.randomUUID(), spanId: crypto.randomUUID() };
    const startedAt = Date.now();
    let ended = false;
    return {
      context,
      end: (endAttributes) => {
        if (ended) return false;
        ended = true;
        return this.span(name, Math.max(0, Date.now() - startedAt), {
          ...attributes,
          ...endAttributes,
          traceId: context.traceId,
          spanId: context.spanId,
          ...(parentContext ? { parentSpanId: parentContext.spanId } : {}),
        });
      },
    };
  }

  async withSpan<T>(
    name: string,
    operation: (context: SpanContext) => Promise<T> | T,
    attributes?: Record<string, TelemetryValue>,
    parentContext?: SpanContext,
  ): Promise<T> {
    const span = this.startSpan(name, attributes, parentContext);
    try {
      const result = await operation(span.context);
      span.end({ status: "ok" });
      return result;
    } catch (error) {
      span.end({ status: "error" });
      throw error;
    }
  }

  private enqueue(event: Omit<TelemetryEvent, "timestamp">): boolean {
    if (this.closed) throw new Error("This Jerico client has been closed.");
    const name = event.name.trim();
    if (!name || name.length > 160) throw new Error("Telemetry event name must contain 1–160 characters.");
    for (const [key, value] of Object.entries(event.attributes ?? {})) {
      if (!key || key.length > 128) throw new Error("Telemetry attribute keys must contain 1–128 characters.");
      if (typeof value === "string" && value.length > 2048) throw new Error("Telemetry attribute values cannot exceed 2048 characters.");
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Telemetry attribute numbers must be finite.");
    }
    if (event.message && event.message.length > 8192) event = { ...event, message: event.message.slice(0, 8192) };
    if (this.queue.length + this.inFlightCount >= this.maxQueueSize) {
      this.reportError(new Error("Jerico telemetry queue is full; the new event was dropped."));
      return false;
    }
    this.queue.push({ ...event, name, timestamp: new Date().toISOString() });
    if (!this.timerBlocked && this.queue.length >= this.maxBatchSize) {
      void this.flushBatch().catch(this.reportError);
    }
    return true;
  }

  async flush(): Promise<void> {
    this.timerBlocked = false;
    while (this.queue.length > 0 || this.inFlight) await this.flushBatch();
  }

  private async flushBatch(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.maxBatchSize);
    this.inFlightCount = batch.length;
    this.inFlight = (async () => {
      try {
        const response = await this.fetcher(`${this.endpoint}/ingest/v1/events`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ events: batch }),
        });
        if (!response.ok) {
          const retryAfter = Number(response.headers.get("retry-after"));
          throw new JericoHttpError(
            `Jerico ingestion request failed with HTTP ${response.status}.`,
            response.status,
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
          );
        }
      } catch (error) {
        this.queue = [...batch, ...this.queue];
        this.timerBlocked = true;
        throw error;
      } finally {
        this.inFlightCount = 0;
        this.inFlight = undefined;
      }
    })();
    return this.inFlight;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
  }

  private readonly reportError = (error: unknown): void => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    try { this.options.onError?.(normalized); } catch { /* Never let SDK callbacks crash the host application. */ }
  };
}
