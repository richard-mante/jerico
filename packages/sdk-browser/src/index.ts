import { JericoClient, type JericoClientOptions, type LogLevel, type SpanContext, type TelemetryValue } from "@jerico/sdk-core";
import { isPublicWebVitalMetric } from "./web-vitals";

export type BrowserJericoOptions = JericoClientOptions & {
  capturePageViews?: boolean;
  captureErrors?: boolean;
  captureWebVitals?: boolean;
};

const SESSION_STORAGE_KEY = "jerico.session_id";

export class BrowserJericoClient extends JericoClient {
  private sessionId: string;
  private userId: string | undefined;
  private readonly performanceObservers: PerformanceObserver[] = [];
  private readonly interactionDurations = new Map<number, number>();
  private largestContentfulPaint = 0;
  private cumulativeLayoutShift = 0;
  private webVitalsSent = false;

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

  override metric(name: string, value: number, attributes?: Record<string, TelemetryValue>): boolean {
    if (!isPublicWebVitalMetric(name)) {
      throw new Error("Browser credentials may submit only allowlisted Core Web Vitals metrics.");
    }
    return super.metric(name, value, { ...attributes, source: "browser-web-vitals", path: window.location.pathname });
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
    window.addEventListener("pagehide", this.onPageHide);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation && navigation.responseStart >= navigation.requestStart) {
      this.metric("web.vitals.ttfb", navigation.responseStart - navigation.requestStart, {
        navigationType: navigation.type,
      });
    }

    this.observePerformance("paint", (entries) => {
      const fcp = entries.find((entry) => entry.name === "first-contentful-paint");
      if (fcp) this.metric("web.vitals.fcp", fcp.startTime);
    });
    this.observePerformance("largest-contentful-paint", (entries) => {
      for (const entry of entries) this.largestContentfulPaint = Math.max(this.largestContentfulPaint, entry.startTime);
    });
    this.observePerformance("layout-shift", (entries) => {
      for (const entry of entries) {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (!shift.hadRecentInput) this.cumulativeLayoutShift += shift.value ?? 0;
      }
    });
    this.observePerformance("event", (entries) => {
      for (const entry of entries) {
        const interaction = entry as PerformanceEntry & { duration?: number; interactionId?: number };
        if (!interaction.interactionId || !interaction.duration) continue;
        const current = this.interactionDurations.get(interaction.interactionId) ?? 0;
        this.interactionDurations.set(interaction.interactionId, Math.max(current, interaction.duration));
      }
    });
  }

  private flushWebVitals(): void {
    if (this.webVitalsSent) return;
    this.webVitalsSent = true;
    const attributes = { navigationType: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type ?? "unknown" };
    if (this.largestContentfulPaint > 0) this.metric("web.vitals.lcp", this.largestContentfulPaint, attributes);
    this.metric("web.vitals.cls", this.cumulativeLayoutShift, attributes);
    if (this.interactionDurations.size > 0) {
      const interactions = Array.from(this.interactionDurations.values()).sort((a, b) => b - a);
      const p98Index = Math.min(interactions.length - 1, Math.floor(interactions.length / 50));
      this.metric("web.vitals.inp", interactions[p98Index], { ...attributes, interactionCount: interactions.length });
    }
  }

  capturePageView(attributes?: Record<string, TelemetryValue>): boolean {
    return this.track("page.view", {
      path: window.location.pathname,
      title: document.title.slice(0, 512),
      ...attributes,
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
