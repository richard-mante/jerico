import { JericoClient, type JericoClientOptions, type TelemetryValue } from "@jerico/sdk-core";

export type BrowserJericoOptions = JericoClientOptions & {
  capturePageViews?: boolean;
  captureErrors?: boolean;
};

const SESSION_STORAGE_KEY = "jerico.session_id";

export class BrowserJericoClient extends JericoClient {
  private sessionId: string;
  private userId: string | undefined;

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

  override metric(_name: string, _value: number, _attributes?: Record<string, TelemetryValue>): never {
    throw new Error("Browser credentials cannot submit metrics; use a secret key from a trusted server.");
  }

  override span(_name: string, _valueMs: number, _attributes?: Record<string, TelemetryValue>): never {
    throw new Error("Browser credentials cannot submit spans; use a secret key from a trusted server.");
  }

  capturePageView(attributes?: Record<string, TelemetryValue>): boolean {
    return this.track("page.view", {
      path: window.location.pathname,
      title: document.title,
      ...attributes,
    });
  }

  override async close(): Promise<void> {
    window.removeEventListener("error", this.onWindowError);
    window.removeEventListener("unhandledrejection", this.onUnhandledRejection);
    await super.close();
  }
}

export function createBrowserClient(options: BrowserJericoOptions): BrowserJericoClient {
  return new BrowserJericoClient(options);
}

export type { TelemetryValue } from "@jerico/sdk-core";
