# @jerico/sdk-node

Server-side TypeScript SDK for sending application telemetry to Jerico Observability.

## Install status

This package remains private and is not published to npm yet. Its workspace package build emits ESM JavaScript and TypeScript declarations to `dist/`.

## Quick start

```ts
import { createNodeClient } from "@jerico/sdk-node";

const jerico = createNodeClient({
  apiKey: process.env.JERICO_SECRET_KEY!,
  endpoint: process.env.JERICO_INGEST_URL!,
});

jerico.track("order.completed", { orderId: "order_123" });

await jerico.flush();
// Call close() during graceful process shutdown.
await jerico.close();
```

The Node SDK requires a `jk_sec_` project key. Keep it in server-only environment variables and never expose it to browser bundles or source control.

Ingestion requests time out after 10 seconds by default; configure `requestTimeoutMs` (100–120,000 ms) for slower endpoints. Unhandled rejection capture is opt-in with `captureUnhandledRejections: true`. The SDK does not install process exit handlers. Always close the client during graceful shutdown; the queue is in-memory and cannot survive forced termination.

## Build

```sh
pnpm --filter @jerico/sdk-node build
```

The Node package depends on the workspace `@jerico/sdk-core` package. Turbo builds dependencies before this package.
