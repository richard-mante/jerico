import { describe, expect, it } from "vitest";
import { isPublicWebVitalMetric } from "./web-vitals";

describe("public browser performance metric allowlist", () => {
  it.each(["web.vitals.lcp", "web.vitals.cls", "web.vitals.inp", "web.vitals.fcp", "web.vitals.ttfb"])("allows %s", (name) => {
    expect(isPublicWebVitalMetric(name)).toBe(true);
  });

  it.each(["custom.metric", "http.request.duration", "web.vitals.custom", "web.vitals.lcp.extra"])("rejects %s", (name) => {
    expect(isPublicWebVitalMetric(name)).toBe(false);
  });
});
