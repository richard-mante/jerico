import { describe, expect, it } from "vitest";
import { isAllowedPublicMetric } from "./public-metrics";

describe("public metric scope", () => {
  it.each(["web.vitals.lcp", "web.vitals.cls", "web.vitals.inp", "web.vitals.fcp", "web.vitals.ttfb"])("allows %s", (name) => {
    expect(isAllowedPublicMetric(name)).toBe(true);
  });
  it.each(["http.request.duration", "custom.metric", "web.vitals.custom", "web.vitals.lcp.extra"])("rejects %s", (name) => {
    expect(isAllowedPublicMetric(name)).toBe(false);
  });
});
