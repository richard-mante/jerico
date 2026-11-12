import { JericoClient, type JericoClientOptions, type LogLevel, type SpanContext, type TelemetryValue } from "@jerico/sdk-core";
import { isPublicWebVitalMetric } from "./web-vitals.js";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { resolveRoutePath } from "./route-path.js";

export type BrowserJericoOptions = JericoClientOptions & {
  capturePageViews?: boolean;
  captureErrors?: boolean;
  captureWebVitals?: boolean;
  resolveRoute?: (pathname: string) => string;
};

const SESSION_STORAGE_KEY = "jerico.session_id";

export class BrowserJericoClient extends JericoClient {
  private sessionId: string;
  private userId: string | undefined;
  private captureWebVitalsEnabled = false;
  private webVitalsPath = "";
  private readonly routeResolver: BrowserJericoOptions["resolveRoute"];

  private createSessionId(): string {
    const id = crypto.randomUUID();
    try { window.sessionStorage.setItem(SESSION_STORAGE_KEY, id); } catch { /* Storage may be disabled. */ }
    return id;
  }

  private loadSessionId(): string {
    try {
      const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (existing) return existing;
    } catch { /* Storage may be disabled. */ }
    return this.createSessionId();
  }

  private readonly onWindowError = (event: ErrorEvent): void => {
    if (event.error instanceof Error) this.captureError(event.error, { source: "window" });
    else this.track("javascript.error", { message: event.message, source: "window" });
  };

  private readonly onPageHide = (): void => this.flushAfterPageTransition();

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") this.flushAfterPageTransition();
  };

  private readonly onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    if (reason instanceof Error) this.captureError(reason, { source: "unhandledrejection" });
    else this.track("javascript.unhandled_rejection", {
      reason: typeof reason === "string" ? reason.slice(0, 1000) : "Non-error rejection",
    });
  };

  constructor(options: BrowserJericoOptions) {
    if (!options.apiKey.startsWith("jk_pub_")) {
      throw new Error("The browser SDK requires a public Jerico key (jk_pub_). Never expose secret keys in a browser.");
    }
    super(options);
    this.routeResolver = options.resolveRoute;
    this.sessionId = this.loadSessionId();
    if (options.capturePageViews) this.capturePageView();
    if (options.captureErrors !== false) {
      window.addEventListener("error", this.onWindowError);
      window.addEventListener("unhandledrejection", this.onUnhandledRejection);
    }
    if (options.captureWebVitals) this.startWebVitalsCapture();
  }

  override track(name: string, attributes?: Record<string, TelemetryValue>): boolean {
    return super.track(name, {
      ...attributes,
      sessionId: this.sessionId,
      ...(this.userId ? { userId: this.userId } : {}),
    });
  }

  override captureError(error: Error, attributes?: Record<string, TelemetryValue>): boolean {
    return super.captureError(error, {
      ...attributes,
      sessionId: this.sessionId,
      ...(this.userId ? { userId: this.userId } : {}),
    });
  }

  identify(userId: string, traits?: Record<string, TelemetryValue>): boolean {
    const normalized = userId.trim();
    if (!normalized || normalized.length > 2048) throw new Error("User identity must contain 1–2048 characters.");
    this.userId = normalized;
    return this.track("user.identify", { ...traits, userId: normalized });
  }

  reset(): void {
    this.userId = undefined;
    this.sessionId = this.createSessionId();
  }

  override log(_name: string, _message: string, _attributes?: Record<string, TelemetryValue>): never {
    throw new Error("Browser credentials cannot submit logs; use a secret key from a trusted server.");
  }

  override logWithLevel(_level: LogLevel, _name: string, _message: string, _attributes?: Record<string, TelemetryValue>): never {
    throw new Error("Browser credentials cannot submit logs; use a secret key from a trusted server.");
  }

  override metric(_name: string, _value: number, _attributes?: Record<string, TelemetryValue>): never {
    throw new Error("Browser credentials cannot submit custom metrics; enable captureWebVitals to collect allowlisted browser performance metrics.");
  }

  override span(_name: string, _valueMs: number, _attributes?: Record<string, TelemetryValue>): never {
    throw new Error("Browser credentials cannot submit spans; use a secret key from a trusted server.");
  }

  override startSpan(_name: string, _attributes?: Record<string, TelemetryValue>, _parentContext?: SpanContext): never {
    throw new Error("Browser credentials cannot submit spans; use a secret key from a trusted server.");
  }

  override withSpan<T>(_name: string, _operation: (context: SpanContext) => Promise<T> | T, _attributes?: Record<string, TelemetryValue>, _parentContext?: SpanContext): Promise<T> {
    throw new Error("Browser credentials cannot submit spans; use a secret key from a trusted server.");
  }

  private currentRoutePath(): string {
    return resolveRoutePath(window.location.pathname, this.routeResolver);
  }

  private startWebVitalsCapture(): void {
    this.captureWebVitalsEnabled = true;
    this.webVitalsPath = this.currentRoutePath();

    type WebVitalMetric = {
      value: number;
      rating?: string;
      id?: string;
      navigationType?: string;
      delta?: number;
    };
    const report = (name: string) => (metric: WebVitalMetric): void => {
      if (!this.captureWebVitalsEnabled) return;
      this.recordWebVital(name, metric);
    };

    onCLS(report("web.vitals.cls"));
    onFCP(report("web.vitals.fcp"));
    onINP(report("web.vitals.inp"));
    onLCP(report("web.vitals.lcp"));
    onTTFB(report("web.vitals.ttfb"));

    // Register after the library listeners so final metrics are queued before
    // the best-effort page-transition flush begins.
    window.addEventListener("pagehide", this.onPageHide);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private recordWebVital(name: string, metric: {
    value: number;
    rating?: string;
    id?: string;
    navigationType?: string;
    delta?: number;
  }): boolean {
    if (!isPublicWebVitalMetric(name) || !Number.isFinite(metric.value) || metric.value < 0) return false;
    const unit = name === "web.vitals.cls" ? "score" : "ms";
    return super.metric(name, metric.value, {
      unit,
      ...(metric.rating ? { rating: metric.rating } : {}),
      ...(metric.id ? { metricId: metric.id } : {}),
      ...(metric.navigationType ? { navigationType: metric.navigationType } : {}),
      ...(typeof metric.delta === "number" && Number.isFinite(metric.delta) ? { delta: metric.delta } : {}),
      source: "browser-web-vitals",
      path: this.webVitalsPath || window.location.pathname,
    });
  }

  private flushAfterPageTransition(): void {
    if (!this.captureWebVitalsEnabled) return;
    // web-vitals finalizes some metrics in its own page lifecycle listeners.
    // Defer until those listeners have had a chance to enqueue their results.
    setTimeout(() => {
      if (this.captureWebVitalsEnabled) void this.flush().catch(() => undefined);
    }, 0);
  }

  capturePageView(attributes?: Record<string, TelemetryValue>): boolean {
    return this.track("page.view", {
      ...attributes,
      path: this.currentRoutePath(),
      title: document.title.slice(0, 512),
    });
  }

  override async close(): Promise<void> {
    window.removeEventListener("error", this.onWindowError);
    window.removeEventListener("unhandledrejection", this.onUnhandledRejection);
    window.removeEventListener("pagehide", this.onPageHide);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.captureWebVitalsEnabled = false;
    await super.close();
  }
}

export function createBrowserClient(options: BrowserJericoOptions): BrowserJericoClient {
  return new BrowserJericoClient(options);
}

export type { LogLevel, SpanContext, SpanHandle, TelemetryValue } from "@jerico/sdk-core";
