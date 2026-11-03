const PUBLIC_WEB_VITAL_METRICS = new Set([
  "web.vitals.lcp",
  "web.vitals.cls",
  "web.vitals.inp",
  "web.vitals.fcp",
  "web.vitals.ttfb",
]);

export function isAllowedPublicMetric(name: string): boolean {
  return PUBLIC_WEB_VITAL_METRICS.has(name);
}
