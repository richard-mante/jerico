# @jerico/sdk-core

Shared TypeScript telemetry client used by the Jerico browser and Node SDKs.

## Responsibilities

- Bounded in-memory event buffering and batch delivery.
- Explicit `flush()` and graceful `close()` lifecycle methods.
- Events, errors, logs, metrics, and spans.
- Request-level idempotency keys reused with the exact batch payload after an ambiguous failure.
- Configurable endpoint, queue/batch count and byte limits, flush interval, request timeout (10 seconds by default; 100–120,000 ms), fetch implementation, and non-throwing error callback. Batches default to 80 KiB and can be configured up to the ingestion endpoint's 96 KiB limit; an individually oversized event is rejected with `false` and reported through `onError`.

This package is an internal workspace dependency. It is not currently published to npm.

## Build

```sh
pnpm --filter @jerico/sdk-core build
```

The build emits ESM JavaScript, source maps, and TypeScript declarations to `dist/`.
