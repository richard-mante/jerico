# @jerico/sdk-core

Shared TypeScript telemetry client used by the Jerico browser and Node SDKs.

## Responsibilities

- Bounded in-memory event buffering and batch delivery.
- Explicit `flush()` and graceful `close()` lifecycle methods.
- Events, errors, logs, metrics, and spans.
- Request-level idempotency keys reused with the exact batch payload after an ambiguous failure.
- Configurable endpoint, queue/batch limits, flush interval, fetch implementation, and non-throwing error callback.

This package is an internal workspace dependency. It is not currently published to npm.

## Build

```sh
pnpm --filter @jerico/sdk-core build
```

The build emits ESM JavaScript, source maps, and TypeScript declarations to `dist/`.