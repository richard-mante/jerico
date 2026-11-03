export class DailyQuotaExceeded extends Error {
  constructor(readonly retryAfter: number) {
    super("The daily event quota has been reached.");
    this.name = "DailyQuotaExceeded";
  }
}

export function utcUsageDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function secondsUntilUtcMidnight(now = new Date()): number {
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
}

export function dailyEventLimit(value?: string): number {
  const configured = Number(value ?? 100000);
  if (!Number.isSafeInteger(configured) || configured < 1) {
    throw new Error("INGEST_DAILY_EVENT_LIMIT must be a positive safe integer.");
  }
  return configured;
}
