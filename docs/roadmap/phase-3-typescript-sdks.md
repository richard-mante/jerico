# Phase 3 — TypeScript SDKs

**Status:** Initial SDK foundation, compiled ESM package structure, and official Core Web Vitals capture are merged to `main` (PR #6, PR #136, and PR #140). Build/runtime validation, ingestion integration, licensing, and publication remain pending.

## Packages

| Package | Purpose | Initial capabilities |
|---|---|---|
| `@jerico/sdk-core` | Shared transport and buffering | bounded in-memory queue, batching, custom events, errors, logs, metrics, spans, explicit flush/close |
| `@jerico/sdk-browser` | Browser instrumentation | public-key enforcement, anonymous session IDs, explicit identify/reset, page views, window errors, unhandled promise rejections |
| `@jerico/sdk-node` | Server-side instrumentation | secret-key enforcement, custom events/errors/logs/metrics/spans, opt-in unhandled rejection capture |

All packages are TypeScript-first workspace packages. They are intentionally private until a build/output and package publishing strategy is validated.

## Configuration

The SDK requires both a project ingestion key and an explicit endpoint. No hosted Jerico ingest domain is assumed.

- Browser applications must use a `jk_pub_` key. Public keys can submit events, errors, and only the allowlisted `web.vitals.lcp`, `web.vitals.cls`, `web.vitals.inp`, `web.vitals.fcp`, and `web.vitals.ttfb` metrics. Other browser metrics, logs, and spans remain blocked. Core Web Vitals are measured with the official `web-vitals` library rather than a hand-built PerformanceObserver approximation.
- Node.js applications must use a `jk_sec_` key. Secret keys must never be exposed to browser code.
- The browser SDK captures pathname and document title for page views; it does not collect query strings or URL fragments. Core Web Vitals capture uses Google's `web-vitals` APIs, forwarding metric value, rating, ID, navigation type, and delta while retaining Jerico's public metric allowlist.
- Automatic browser error capture is enabled by default and can be disabled.
- Node unhandled-rejection capture is opt-in. The SDK does not install process exit handlers.

## Delivery behavior and limitations

- Events are buffered in memory, with a configurable maximum queue size and batch size (1–100).
- The default batch size is 50 and the default periodic flush interval is 10 seconds.
- Call `flush()` to explicitly send pending events and `close()` during graceful shutdown. Ingestion requests are bounded by a configurable 10-second default timeout (`requestTimeoutMs`, 100–120,000 ms); an aborted/ambiguous batch retains the same idempotency key and body for an explicit retry.
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
6. Add Astro/React examples (documentation added in PR #137; sample apps still need execution).
7. Add OpenTelemetry-compatible export/ingestion and controlled npm publishing/release automation after build and license validation.


## Request-level batch idempotency

The SDK core now generates one UUID idempotency key per batch and reuses the exact key and request body when an explicit `flush()` retries a failed batch. This is safe only when paired with the ingestion service's `Idempotency-Key` implementation and migration. Automatic retries remain disabled; buffers remain memory-only.


## Core Web Vitals ratings

When `captureWebVitals: true`, the browser SDK uses Google's `web-vitals` package (`onLCP`, `onCLS`, `onINP`, `onFCP`, and `onTTFB`) and forwards the official metric value, rating, ID, navigation type, and delta. Jerico still enforces the public-key metric allowlist and attaches units/path context. Runtime behavior and browser compatibility remain unvalidated.


## Package build output and release boundary

The three SDK packages now have a compiled ESM package layout:

- `pnpm --filter @jerico/sdk-core build`
- `pnpm --filter @jerico/sdk-browser build` (build core first)
- `pnpm --filter @jerico/sdk-node build` (build core first)

Each package emits JavaScript, source maps, and TypeScript declarations to `dist/`. The browser package uses explicit `.js` relative specifiers so emitted ESM imports are compatible with NodeNext-style package output. Turbo's typecheck task builds workspace package dependencies first so declaration entrypoints exist before downstream typechecking.

The packages intentionally remain `private: true`. Do not publish until the build output is validated, the ingestion endpoint and SDK compatibility are exercised, sample apps are executed, package metadata and licensing are approved, and a release/changelog policy is agreed. No npm publish workflow or credentials are configured by this change. PR #137 adds React/Vite and Astro integration guides; those sample apps still need to be created/executed.
