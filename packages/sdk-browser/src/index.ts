import { JericoClient, type JericoClientOptions, type LogLevel, type SpanContext, type TelemetryValue } from "@jerico/sdk-core";
import { isPublicWebVitalMetric, rateWebVital } from "./web-vitals.js";
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
  private readonly performanceObservers: PerformanceObserver[] = [];
  private readonly interactionDurations = new Map<number, number>();
  private largestContentfulPaint = 0;
  private cumulativeLayoutShift = 0;
  private clsSessionValue = 0;
  private clsSessionStart = 0;
  private clsLastShiftTime = 0;
  private webVitalsSent = false;
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

  private readonly onPageHide = (): void => this.flushWebVitals();

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") this.flushWebVitals();
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

  private observePerformance(type: string, callback: (entries: PerformanceEntry[]) => void): void {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true } as PerformanceObserverInit);
      this.performanceObservers.push(observer);
    } catch {
      // Unsupported entry types are skipped without affecting the host app.
    }
  }

  private startWebVitalsCapture(): void {
    this.captureWebVitalsEnabled = true;
    this.webVitalsPath = this.currentRoutePath();
    window.addEventListener("pagehide", this.onPageHide);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation && navigation.responseStart >= navigation.requestStart) {
      this.recordWebVital("web.vitals.ttfb", navigation.responseStart - navigation.requestStart, {
        navigationType: navigation.type,
      });
    }

    this.observePerformance("paint", (entries) => {
      const fcp = entries.find((entry) => entry.name === "first-contentful-paint");
      if (fcp && !this.webVitalsSent) this.recordWebVital("web.vitals.fcp", fcp.startTime);
    });
    this.observePerformance("largest-contentful-paint", (entries) => {
      if (this.webVitalsSent) return;
      for (const entry of entries) this.largestContentfulPaint = Math.max(this.largestContentfulPaint, entry.startTime);
    });
    this.observePerformance("layout-shift", (entries) => {
      if (this.webVitalsSent) return;
      for (const entry of entries) {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (shift.hadRecentInput) continue;
        if (!this.clsSessionStart || shift.startTime - this.clsLastShiftTime > 1000 || shift.startTime - this.clsSessionStart > 5000) {
          this.clsSessionValue = 0;
          this.clsSessionStart = shift.startTime;
        }
        this.clsSessionValue += shift.value ?? 0;
        this.cumulativeLayoutShift = Math.max(this.cumulativeLayoutShift, this.clsSessionValue);
        this.clsLastShiftTime = shift.startTime;
      }
    });
    this.observePerformance("event", (entries) => {
      if (this.webVitalsSent) return;
      for (const entry of entries) {
        const interaction = entry as PerformanceEntry & { duration?: number; interactionId?: number };
        if (!interaction.interactionId || !interaction.duration) continue;
        const current = this.interactionDurations.get(interaction.interactionId) ?? 0;
        this.interactionDurations.set(interaction.interactionId, Math.max(current, interaction.duration));
      }
    });
  }

  private recordWebVital(name: string, value: number, attributes?: Record<string, TelemetryValue>): boolean {
    if (!isPublicWebVitalMetric(name)) return false;
    const unit = name === "web.vitals.cls" ? "score" : "ms";
    const rating = rateWebVital(name, value);
    return super.metric(name, value, { ...attributes, unit, ...(rating ? { rating } : {}), source: "browser-web-vitals", path: this.webVitalsPath || window.location.pathname });
  }

  private flushWebVitals(): void {
    if (!this.captureWebVitalsEnabled || this.webVitalsSent) return;
    this.webVitalsSent = true;
    const attributes = { navigationType: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type ?? "unknown" };
    if (this.largestContentfulPaint > 0) this.recordWebVital("web.vitals.lcp", this.largestContentfulPaint, attributes);
    this.recordWebVital("web.vitals.cls", this.cumulativeLayoutShift, attributes);
    if (this.interactionDurations.size > 0) {
      const interactions = Array.from(this.interactionDurations.values()).sort((a, b) => b - a);
      // Approximate the field p98 interaction latency from the interaction-duration sample.
      const p98Index = Math.min(interactions.length - 1, Math.floor(interactions.length / 50));
      this.recordWebVital("web.vitals.inp", interactions[p98Index], { ...attributes, interactionCount: interactions.length });
    }
    // Start a best-effort flush while the page is transitioning out of the foreground.
    void this.flush().catch(() => undefined);
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
    this.flushWebVitals();
    for (const observer of this.performanceObservers) observer.disconnect();
    this.performanceObservers.length = 0;
    await super.close();
  }
}

export function createBrowserClient(options: BrowserJericoOptions): BrowserJericoClient {
  return new BrowserJericoClient(options);
}

export type { LogLevel, SpanContext, SpanHandle, TelemetryValue } from "@jerico/sdk-core";
