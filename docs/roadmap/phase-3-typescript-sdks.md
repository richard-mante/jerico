# Phase 3 — TypeScript SDKs

**Status:** Initial SDK foundation implemented on `feat/phase-3-typescript-sdk-foundation`; automated validation and ingestion integration are pending.

## Packages

| Package | Purpose | Initial capabilities |
|---|---|---|
| `@jerico/sdk-core` | Shared transport and buffering | bounded in-memory queue, batching, custom events, errors, logs, metrics, spans, explicit flush/close |
| `@jerico/sdk-browser` | Browser instrumentation | public-key enforcement, anonymous session IDs, explicit identify/reset, page views, window errors, unhandled promise rejections |
| `@jerico/sdk-node` | Server-side instrumentation | secret-key enforcement, custom events/errors/logs/metrics/spans, opt-in unhandled rejection capture |

All packages are TypeScript-first workspace packages. They are intentionally private until a build/output and package publishing strategy is validated.

## Configuration

The SDK requires both a project ingestion key and an explicit endpoint. No hosted Jerico ingest domain is assumed.

- Browser applications must use a `jk_pub_` key. Public keys can submit events and errors only.
- Node.js applications must use a `jk_sec_` key. Secret keys must never be exposed to browser code.
- The browser SDK captures pathname and document title for page views; it does not collect query strings or URL fragments.
- Automatic browser error capture is enabled by default and can be disabled.
- Node unhandled-rejection capture is opt-in. The SDK does not install process exit handlers.

## Delivery behavior and limitations

- Events are buffered in memory, with a configurable maximum queue size and batch size (1–100).
- The default batch size is 50 and the default periodic flush interval is 10 seconds.
- Call `flush()` to explicitly send pending events and `close()` during graceful shutdown.
- A failed batch is retained in memory and reported through `onError`. Automatic retries are deliberately disabled after a failed request until server-side request idempotency exists; an ambiguous response may mean the server accepted the batch.
- The queue is not persisted. A process/browser crash can lose buffered events.
- Browser logs, metrics, and spans are blocked because the current public-key ingestion policy permits only events and errors.
- Redaction is performed by the ingestion service; SDK-side redaction and configurable sampling are future work.

## Remaining work

1. Validate workspace install, lint, typecheck, tests, and builds.
2. Add integration tests against the ingestion Worker and ClickHouse.
3. Add request-level idempotency to the ingestion API before automatic SDK retries.
4. Add browser session identity, identify/reset, route navigation instrumentation, and Core Web Vitals.
5. Add richer Node instrumentation and framework adapters.
6. Add Next.js, Astro, React, and Express examples.
7. Add OpenTelemetry-compatible export/ingestion and package build/release workflows.
