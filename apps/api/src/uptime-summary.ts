export function calculateUptimePercentage(upChecks: number, totalChecks: number): number | null {
  if (!Number.isFinite(upChecks) || !Number.isFinite(totalChecks) || totalChecks <= 0) return null;
  const boundedUpChecks = Math.max(0, Math.min(totalChecks, upChecks));
  return Math.round((boundedUpChecks / totalChecks) * 10000) / 100;
}
