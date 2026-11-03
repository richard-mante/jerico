import { describe, expect, it } from "vitest";
import { isPublicWebVitalMetric, rateWebVital } from "./web-vitals";

describe("public browser performance metric allowlist", () => {
  it.each(["web.vitals.lcp", "web.vitals.cls", "web.vitals.inp", "web.vitals.fcp", "web.vitals.ttfb"])("allows %s", (name) => {
    expect(isPublicWebVitalMetric(name)).toBe(true);
  });

  it.each(["custom.metric", "http.request.duration", "web.vitals.custom", "web.vitals.lcp.extra"])("rejects %s", (name) => {
    expect(isPublicWebVitalMetric(name)).toBe(false);
  });
});

describe("Core Web Vitals ratings", () => {
  it("uses the published good and needs-improvement thresholds", () => {
    expect(rateWebVital("web.vitals.lcp", 2500)).toBe("good");
    expect(rateWebVital("web.vitals.lcp", 3000)).toBe("needs-improvement");
    expect(rateWebVital("web.vitals.lcp", 4001)).toBe("poor");
    expect(rateWebVital("web.vitals.cls", 0.1)).toBe("good");
    expect(rateWebVital("web.vitals.inp", 500)).toBe("needs-improvement");
    expect(rateWebVital("web.vitals.ttfb", -1)).toBeNull();
  });
});
