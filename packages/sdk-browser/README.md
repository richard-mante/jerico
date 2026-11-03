# @jerico/sdk-browser

Use a **public** project key in browser code. Secret keys must never be shipped to a browser.

```ts
import { createBrowserClient } from "@jerico/sdk-browser";

const jerico = createBrowserClient({
  apiKey: import.meta.env.PUBLIC_JERICO_KEY,
  endpoint: import.meta.env.PUBLIC_JERICO_INGEST_URL,
  capturePageViews: true,
  captureWebVitals: true,
});

jerico.track("signup.completed", { method: "email" });
jerico.identify("user_123", { plan: "starter" });
jerico.capturePageView();

// When the user signs out or switches accounts:
jerico.reset();
```

The browser client keeps a random anonymous session ID in sessionStorage (with an in-memory fallback), supports explicit identify/reset calls, and can capture uncaught window errors and unhandled promise rejections. The SDK does not automatically collect a person's identity; pass an application-level user ID only when appropriate. Page-view capture records the pathname and document title, not the query string or fragment. Disable automatic error capture with `captureErrors: false`.

Set `captureWebVitals: true` to collect browser performance metrics. The SDK observes TTFB and FCP when available, tracks LCP and CLS, and estimates INP from observed interaction durations. LCP, CLS, and INP are finalized when the page becomes hidden or is closed; delivery is best-effort. Unsupported PerformanceObserver entry types are skipped. Browser credentials can submit events, errors, and only these server-allowlisted metrics: `web.vitals.lcp`, `web.vitals.cls`, `web.vitals.inp`, `web.vitals.fcp`, and `web.vitals.ttfb`. Custom browser metrics, logs, and spans remain blocked. Page paths are recorded without query strings or fragments. Core Web Vitals use the pathname captured when instrumentation starts so later SPA navigation does not relabel the initial document's measurements.

Configure the ingest endpoint explicitly; do not assume a hosted endpoint until your Jerico deployment provides one.


## Route normalization

Page views and Core Web Vitals use normalized pathname-only route names. By default, UUIDs, long hexadecimal IDs, and long numeric path segments are replaced with `:id`; query strings and fragments are removed, and path length is bounded. For framework routes or dynamic slugs, provide `resolveRoute(pathname)` to return your route template (for example `/users/:userId/orders/:orderId`). The resolver is optional; if it throws, the SDK falls back to the built-in normalization. Do not return personal or secret values from a custom resolver.
