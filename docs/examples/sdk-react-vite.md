# React + Vite example

Install/link `@jerico/sdk-browser` in the React application workspace. Keep the SDK client in a browser-only module and use only a public project key.

```ts
// src/lib/jerico.ts
import { createBrowserClient } from "@jerico/sdk-browser";

export const jerico = createBrowserClient({
  apiKey: import.meta.env.VITE_JERICO_PUBLIC_KEY,
  endpoint: import.meta.env.VITE_JERICO_INGEST_URL,
  captureErrors: true,
  captureWebVitals: true,
});
```

Track client-side route changes with React Router:

```tsx
// src/components/jerico-page-view.tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { jerico } from "../lib/jerico";

export function JericoPageView() {
  const location = useLocation();

  useEffect(() => {
    jerico.capturePageView({ path: location.pathname });
  }, [location.pathname]);

  return null;
}
```

Render `<JericoPageView />` once inside the router. Do not enable `capturePageViews` on the client when using the route component, or the initial page view will be duplicated.

Use `jerico.identify(user.id)` after authenticated identity is known and `jerico.reset()` on sign-out or account switching. Call `jerico.close()` only when the application is actually shutting down; the browser queue is in-memory and page-finalized delivery is best-effort.

Never expose a `jk_sec_` key or send personal data, tokens, or secrets as event attributes.
