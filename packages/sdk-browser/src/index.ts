import { JericoClient, type JericoClientOptions, type TelemetryValue } from "@jerico/sdk-core";

export type BrowserJericoOptions = JericoClientOptions & {
  capturePageViews?: boolean;
  captureErrors?: boolean;
};

export class BrowserJericoClient extends JericoClient {
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
    if (options.capturePageViews) this.capturePageView();
    if (options.captureErrors !== false) {
      window.addEventListener("error", this.onWindowError);
      window.addEventListener("unhandledrejection", this.onUnhandledRejection);
    }
  }

  override log(): never {
    throw new Error("Browser credentials cannot submit logs; use a secret key from a trusted server.");
  }

  override metric(): never {
    throw new Error("Browser credentials cannot submit metrics; use a secret key from a trusted server.");
  }

  override span(): never {
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
