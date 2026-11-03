# @jerico/sdk-browser

Use a **public** project key in browser code. Secret keys must never be shipped to a browser.

```ts
import { createBrowserClient } from "@jerico/sdk-browser";

const jerico = createBrowserClient({
  apiKey: import.meta.env.PUBLIC_JERICO_KEY,
  endpoint: import.meta.env.PUBLIC_JERICO_INGEST_URL,
  capturePageViews: true,
});

jerico.track("signup.completed", { method: "email" });
jerico.identify("user_123", { plan: "starter" });
jerico.capturePageView();

// When the user signs out or switches accounts:
jerico.reset();
```

The browser client keeps a random anonymous session ID in sessionStorage (with an in-memory fallback), supports explicit identify/reset calls, and can capture uncaught window errors and unhandled promise rejections. The SDK does not automatically collect a person's identity; pass an application-level user ID only when appropriate. Page-view capture records the pathname and document title, not the query string or fragment. Disable automatic error capture with `captureErrors: false`.

Configure the ingest endpoint explicitly; do not assume a hosted endpoint until your Jerico deployment provides one. Browser credentials are restricted server-side to event and error telemetry.
