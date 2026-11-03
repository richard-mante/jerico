import { describe, expect, it } from "vitest";
import { hashPresentedCredential, readBearerCredential } from "./credentials";

describe("ingestion credential parsing", () => {
  it("accepts public and secret bearer credentials", () => {
    expect(readBearerCredential("Bearer jk_pub_" + "a".repeat(64))).toBe("jk_pub_" + "a".repeat(64));
    expect(readBearerCredential("Bearer jk_sec_" + "b".repeat(64))).toBe("jk_sec_" + "b".repeat(64));
  });
  it("rejects malformed and missing credentials", () => {
    expect(readBearerCredential(undefined)).toBeNull();
    expect(readBearerCredential("Basic abc")).toBeNull();
    expect(readBearerCredential("Bearer jk_pub_short")).toBeNull();
  });
  it("hashes credentials without returning their raw value", () => {
    const raw = "jk_pub_" + "c".repeat(64);
    expect(hashPresentedCredential(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPresentedCredential(raw)).not.toBe(raw);
  });
});
