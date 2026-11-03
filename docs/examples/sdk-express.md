# Express / Node.js example

Install/link `@jerico/sdk-node` in the server workspace and store the secret key in server-only environment variables.

```ts
import express from "express";
import { createNodeClient } from "@jerico/sdk-node";

const app = express();
const jerico = createNodeClient({
  apiKey: process.env.JERICO_SECRET_KEY!,
  endpoint: process.env.JERICO_INGEST_URL!,
});

app.post("/orders", async (request, response) => {
  // Persist the order before reporting it as completed.
  const order = await createOrder(request.body);
  jerico.track("order.completed", {
    orderId: order.id,
    currency: order.currency,
    total: order.total,
  });
  response.status(201).json({ id: order.id });
});

const server = app.listen(process.env.PORT ?? 3000);

async function shutdown() {
  server.close();
  await jerico.close();
}

process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
```

The SDK uses an in-memory queue. Call `close()` during graceful shutdown to flush pending telemetry, but do not rely on it to survive a forced termination. Keep secret keys out of logs, client bundles, and source control.
