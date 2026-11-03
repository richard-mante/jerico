# @jerico/sdk-node

Use a **secret** project key only in trusted server-side environments. Never expose it in browser bundles, mobile apps, or public repositories.

```ts
import { createNodeClient } from "@jerico/sdk-node";

const jerico = createNodeClient({
  apiKey: process.env.JERICO_SECRET_KEY!,
  endpoint: process.env.JERICO_INGEST_URL!,
  captureUnhandledRejections: true,
});

jerico.track("order.completed", { orderId: "order_123" });
jerico.log("billing.invoice.created", "Invoice created", { amount: 49 });
jerico.metric("queue.depth", 12);

await jerico.flush();
await jerico.close();
```

Call `close()` during graceful shutdown to stop the timer and flush pending events. The SDK does not install process exit handlers or terminate the host process. Unhandled rejection capture is opt-in and does not suppress Node's normal process behavior.
