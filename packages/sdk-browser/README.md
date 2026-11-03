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
jerico.capturePageView();
```

The browser client can capture uncaught window errors and unhandled promise rejections. Page-view capture records the pathname and document title, not the query string or fragment. Disable automatic error capture with `captureErrors: false`.

Configure the ingest endpoint explicitly; do not assume a hosted endpoint until your Jerico deployment provides one. Browser credentials are restricted server-side to event and error telemetry.
