import type { TelemetryEvent } from "@jerico/contracts";

export const MAX_FUTURE_EVENT_SKEW_MS = 60_000;

export function hasFutureTimestampBeyondSkew(
  events: Array<Pick<TelemetryEvent, "timestamp">>,
  acceptedAt: Date,
  maxFutureSkewMs = MAX_FUTURE_EVENT_SKEW_MS,
): boolean {
  const latestAllowedTimestamp = acceptedAt.getTime() + maxFutureSkewMs;
  return events.some((event) =>
    event.timestamp !== undefined && Date.parse(event.timestamp) > latestAllowedTimestamp
  );
}
