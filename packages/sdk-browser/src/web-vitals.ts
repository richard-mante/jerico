const PUBLIC_WEB_VITAL_METRICS = new Set([
  "web.vitals.lcp",
  "web.vitals.cls",
  "web.vitals.inp",
  "web.vitals.fcp",
  "web.vitals.ttfb",
]);

export type WebVitalRating = "good" | "needs-improvement" | "poor";

export function isPublicWebVitalMetric(name: string): boolean {
  return PUBLIC_WEB_VITAL_METRICS.has(name);
}

export function rateWebVital(name: string, value: number): WebVitalRating | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const thresholds: Record<string, [number, number]> = {
    "web.vitals.lcp": [2500, 4000],
    "web.vitals.inp": [200, 500],
    "web.vitals.cls": [0.1, 0.25],
    "web.vitals.fcp": [1800, 3000],
    "web.vitals.ttfb": [800, 1800],
  };
  const threshold = thresholds[name];
  if (!threshold) return null;
  if (value <= threshold[0]) return "good";
  if (value <= threshold[1]) return "needs-improvement";
  return "poor";
}
