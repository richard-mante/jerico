# @jerico/sdk-core

Shared telemetry client and event batching implementation used by the browser and Node.js SDKs.

This package is published as a dependency of `@jerico/sdk-browser` and `@jerico/sdk-node`. Most application developers should install one of those runtime-specific packages.

The core client supports events, errors, logs, metrics, spans, bounded in-memory batching, periodic flushing, explicit `flush()` / `close()`, and stable idempotency keys for retrying a failed batch.

See:
- [Browser SDK](../sdk-browser/README.md)
- [Node SDK](../sdk-node/README.md)
- [SDK guide](../../docs/sdk/quickstart.md)
