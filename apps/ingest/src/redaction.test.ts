import { describe, expect, it } from "vitest";
import { redactTelemetryEvent } from "./redaction";

describe("telemetry redaction", () => {
  it("redacts sensitive attribute keys and common secret patterns", () => {
    const result = redactTelemetryEvent({
      type: "error",
      name: "checkout.failed",
      message: "Contact user@example.com using Bearer abc.def",
      attributes: { password: "do-not-store", detail: "sent to user@example.com", count: 3 },
    });
    expect(result.attributes?.password).toBe("[REDACTED]");
    expect(result.attributes?.detail).toBe("sent to [REDACTED_EMAIL]");
    expect(result.message).not.toContain("user@example.com");
    expect(result.message).not.toContain("Bearer abc.def");
    expect(result.attributes?.count).toBe(3);
  });
});
