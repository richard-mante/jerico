import type { TelemetryEvent } from "@jerico/contracts";

const sensitiveKey = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|session|email|phone|address)/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
// Include common OAuth names in snake_case, kebab-case, and camelCase.
const assignmentPattern = /\b(password|passwd|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|token|secret|api[_-]?key|authorization)\s*[:=]\s*([^\s,;]+)/gi;

function redactText(value: string): string {
  return value.replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(jwtPattern, "[REDACTED_TOKEN]")
    .replace(assignmentPattern, "$1=[REDACTED]");
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
    name: redactText(event.name),
    ...(event.message ? { message: redactText(event.message) } : {}),
    ...(event.attributes ? { attributes } : {}),
  };
}
