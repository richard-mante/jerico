# Phase 3 — TypeScript SDKs

**Status:** Initial SDK foundation merged to `main` in PR #6 (`d4894534940805f08ae0bc2e0d591e3762c7cd3a`). Automated validation and ingestion integration remain pending.

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
- A failed batch is retained in memory and reported through `onError`. The in-progress request-idempotency branch adds a stable key to each batch and reuses the exact key/body on explicit retry. Until that server change is merged and validated, do not assume retries are safe.
- The queue is not persisted. A process/browser crash can lose buffered events.
- Browser logs, metrics, and spans are blocked because the current public-key ingestion policy permits only events and errors.
- Redaction is performed by the ingestion service; SDK-side redaction and configurable sampling are future work.

## Integration examples

- [Next.js App Router browser instrumentation](../examples/sdk-nextjs.md)
- [Express / Node.js server instrumentation](../examples/sdk-express.md)

These examples are documentation only; they have not yet been run in sample applications.

## Remaining work

1. Validate workspace install, lint, typecheck, tests, and builds.
2. Add integration tests against the ingestion Worker and ClickHouse.
3. Merge and validate request-level idempotency in the ingestion API before enabling automatic SDK retries.
4. Add browser route navigation instrumentation and Core Web Vitals (after deciding whether/how public keys may submit bounded performance metrics).
5. Add richer Node instrumentation and framework adapters.
6. Add Astro/React examples and execute all sample apps.
7. Add OpenTelemetry-compatible export/ingestion and package build/release workflows.
