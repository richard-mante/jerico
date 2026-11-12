# @jerico/sdk-browser

Browser instrumentation SDK for Jerico Observability.

## Install status

This package remains private and is not published to npm yet. Its workspace package build emits ESM JavaScript and TypeScript declarations to `dist/`.

## Quick start

```ts
import { createBrowserClient } from "@jerico/sdk-browser";

export const jerico = createBrowserClient({
  apiKey: import.meta.env.VITE_JERICO_PUBLIC_KEY,
  endpoint: import.meta.env.VITE_JERICO_INGEST_URL,
  capturePageViews: true,
  captureErrors: true,
  captureWebVitals: true,
});
```

Use only a `jk_pub_` project key in browser code. Never put a `jk_sec_` key in a client bundle. The browser SDK limits public-key telemetry to events, errors, and the five allowlisted Core Web Vitals metrics. It uses Google's `web-vitals` library to measure LCP, CLS, INP, FCP, and TTFB with the library's published ratings and metric identifiers. It does not expose custom logs, metrics, or spans.

Call `identify(userId)` only when the application has a legitimate reason to associate telemetry with a user, and call `reset()` on sign-out or account switching. Avoid sending personal or secret data as attributes.

## Lifecycle

- `flush()` explicitly sends buffered events.
- Ingestion requests time out after 10 seconds by default; configure `requestTimeoutMs` (100–120,000 ms) for slower endpoints.
- `close()` removes instrumentation listeners and flushes the remaining in-memory queue.
- Buffered events are not persisted across a browser crash or forced page termination.

## Build

```sh
pnpm --filter @jerico/sdk-browser build
```

The browser package depends on the workspace `@jerico/sdk-core` package. Turbo builds dependencies before this package.
