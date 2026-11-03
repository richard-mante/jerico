# Next.js App Router example

Install/link `@jerico/sdk-browser` in the application workspace. Keep this module client-only.

```tsx
// src/lib/jerico-browser.ts
"use client";

import { createBrowserClient } from "@jerico/sdk-browser";

export const jerico = createBrowserClient({
  apiKey: process.env.NEXT_PUBLIC_JERICO_PUBLIC_KEY!,
  endpoint: process.env.NEXT_PUBLIC_JERICO_INGEST_URL!,
  captureErrors: true,
  captureWebVitals: true,
});
```

Track route views from a small client component:

```tsx
// src/components/jerico-page-view.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { jerico } from "@/lib/jerico-browser";

export function JericoPageView() {
  const pathname = usePathname();

  useEffect(() => {
    jerico.capturePageView({ path: pathname });
  }, [pathname]);

  return null;
}
```

Set `captureWebVitals: true` to opt into allowlisted browser performance metrics (LCP, CLS, INP, FCP, and TTFB). Delivery of page-finalized metrics is best-effort. Render `<JericoPageView />` once inside the root layout. Do not also enable `capturePageViews` on the client when using this route component, or the initial page will be counted twice.

Use only a public key in `NEXT_PUBLIC_*` variables. Never put a `jk_sec_` key in a Next.js client bundle. User identification is opt-in:

```ts
jerico.identify(user.id, { plan: user.plan });
jerico.reset(); // call on sign-out/account switch
```

Do not send email addresses, names, tokens, or other personal data as event attributes unless you have a clear lawful basis and user-facing disclosure.


For dynamic Next.js routes, supply a route-template resolver so analytics group pages by route rather than by raw IDs:

```ts
const jerico = createBrowserClient({
  apiKey: process.env.NEXT_PUBLIC_JERICO_PUBLIC_KEY!,
  endpoint: process.env.NEXT_PUBLIC_JERICO_INGEST_URL!,
  captureErrors: true,
  captureWebVitals: true,
  resolveRoute: (pathname) => {
    if (/^\/users\/[^/]+$/.test(pathname)) return "/users/:userId";
    if (/^\/orders\/[^/]+$/.test(pathname)) return "/orders/:orderId";
    return pathname;
  },
});
```

The SDK also applies conservative normalization automatically for UUID, long hexadecimal, and long numeric path segments. Query strings and fragments are never included.
