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

- Browser applications must use a `jk_pub_` key. Public keys can submit events, errors, and only the allowlisted `web.vitals.lcp`, `web.vitals.cls`, `web.vitals.inp`, `web.vitals.fcp`, and `web.vitals.ttfb` metrics. Other browser metrics, logs, and spans remain blocked.
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
- Browser logs, custom metrics, and spans are blocked. With `captureWebVitals: true`, the browser SDK internally records only the five allowlisted Core Web Vitals metrics. It observes TTFB/FCP when available, accumulates CLS session windows, tracks LCP, and estimates INP from interaction-duration entries. Final page metrics are flushed best-effort when the document becomes hidden or closes.
- Redaction is performed by the ingestion service; SDK-side redaction and configurable sampling are future work.

## Integration examples

- [Next.js App Router browser instrumentation](../examples/sdk-nextjs.md)
- [Express / Node.js server instrumentation](../examples/sdk-express.md)

These examples are documentation only; they have not yet been run in sample applications.

## Remaining work

1. Validate workspace install, lint, typecheck, tests, and builds.
2. Add integration tests against the ingestion Worker and ClickHouse.
3. Add request-level idempotency to the ingestion API before automatic SDK retries.
4. Add browser route navigation instrumentation and validate Core Web Vitals against the official `web-vitals` implementation across supported browsers.
5. Add richer Node instrumentation and framework adapters.
6. Add Astro/React examples and execute all sample apps.
7. Add OpenTelemetry-compatible export/ingestion and package build/release workflows.


## Request-level batch idempotency

The SDK core now generates one UUID idempotency key per batch and reuses the exact key and request body when an explicit `flush()` retries a failed batch. This is safe only when paired with the ingestion service's `Idempotency-Key` implementation and migration. Automatic retries remain disabled; buffers remain memory-only.


## Core Web Vitals ratings

When `captureWebVitals: true`, the browser SDK attaches a unit (`ms` for time-based metrics, `score` for CLS) and a rating. Thresholds are LCP 2500/4000 ms, INP 200/500 ms, CLS 0.1/0.25, FCP 1800/3000 ms, and TTFB 800/1800 ms for good/needs-improvement boundaries. These ratings are based on the captured page values; field aggregation and official-library equivalence still require validation.
