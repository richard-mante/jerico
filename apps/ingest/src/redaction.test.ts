import { describe, expect, it } from "vitest";
import { redactTelemetryEvent } from "./redaction";

describe("telemetry redaction", () => {
  it("redacts sensitive patterns from event names while preserving static names", () => {
    const result = redactTelemetryEvent({
      type: "event",
      name: "checkout.user@example.com.token=topsecret",
    });
    expect(result.name).toBe("checkout.[REDACTED_EMAIL].token=[REDACTED]");
    expect(redactTelemetryEvent({
      type: "event",
      name: "checkout.completed",
    }).name).toBe("checkout.completed");
  });

  it("redacts bearer credentials and JWTs from event names", () => {
    const result = redactTelemetryEvent({
      type: "event",
      name: "auth.Bearer abc.def.ghi.eyJabcdefgh.eyJpayload.signature",
    });
    expect(result.name).not.toContain("Bearer abc.def.ghi");
    expect(result.name).not.toContain("eyJabcdefgh");
  });

  it("redacts OAuth token and secret assignments in event names and messages", () => {
    const assignments = [
      "access_token=access-value",
      "refresh-token=refresh-value",
      "idToken=id-value",
      "clientSecret=client-value",
    ];
    const result = redactTelemetryEvent({
      type: "event",
      name: `auth.${assignments.join(".")}`,
      message: `OAuth credentials: ${assignments.join(", ")}`,
    });

    for (const value of ["access-value", "refresh-value", "id-value", "client-value"]) {
      expect(result.name).not.toContain(value);
      expect(result.message).not.toContain(value);
    }
    expect(result.name).toContain("access_token=[REDACTED]");
    expect(result.name).toContain("refresh-token=[REDACTED]");
    expect(result.name).toContain("idToken=[REDACTED]");
    expect(result.name).toContain("clientSecret=[REDACTED]");
  });

  it("redacts sensitive attribute keys and common secret patterns", () => {
    const result = redactTelemetryEvent({
      type: "error",
      name: "checkout.failed",
      message: "Contact user@example.com using Bearer abc.def with token=topsecret",
      attributes: { password: "do-not-store", detail: "sent to user@example.com", count: 3 },
    });
    expect(result.attributes?.password).toBe("[REDACTED]");
    expect(result.attributes?.detail).toBe("sent to [REDACTED_EMAIL]");
    expect(result.message).not.toContain("user@example.com");
    expect(result.message).not.toContain("Bearer abc.def");
    expect(result.message).not.toContain("token=topsecret");
    expect(result.attributes?.count).toBe(3);
  });
});
