import type { TelemetryEvent } from "@jerico/contracts";

const sensitiveKey = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|session|email|phone|address)/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function redactText(value: string): string {
  return value.replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(jwtPattern, "[REDACTED_TOKEN]");
}

export function redactTelemetryEvent(event: TelemetryEvent): TelemetryEvent {
  const attributes = Object.fromEntries(
    Object.entries(event.attributes ?? {}).map(([key, value]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : typeof value === "string" ? redactText(value) : value,
    ]),
  );
  return {
    ...event,
    ...(event.message ? { message: redactText(event.message) } : {}),
    ...(event.attributes ? { attributes } : {}),
  };
}
