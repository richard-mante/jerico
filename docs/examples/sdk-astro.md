# Astro example

Install/link `@jerico/sdk-browser` in the Astro application. Add the client script to a shared layout so it runs once across client-side navigations.

```astro
---
// src/layouts/BaseLayout.astro
---
<html lang="en">
  <head>
    <title>My application</title>
  </head>
  <body>
    <slot />
    <script>
      import { createBrowserClient } from "@jerico/sdk-browser";

      const jerico = createBrowserClient({
        apiKey: import.meta.env.PUBLIC_JERICO_PUBLIC_KEY,
        endpoint: import.meta.env.PUBLIC_JERICO_INGEST_URL,
        captureErrors: true,
        captureWebVitals: true,
      });

      document.addEventListener("astro:page-load", () => {
        jerico.capturePageView();
      });
    </script>
  </body>
</html>
```

Astro's `astro:page-load` event runs after the initial page load and client-side navigations. Do not enable `capturePageViews` when listening to this event, or the initial page view may be counted twice.

Only use a `jk_pub_` key in `PUBLIC_*` variables. Never expose a secret project key. The browser queue is memory-only; delivery of page-finalized Core Web Vitals is best-effort.
