import { describe, expect, it } from "vitest";
import { createIngestionCredential, hashIngestionCredential } from "./ingestion-keys";

describe("ingestion credentials", () => {
  it.each(["public", "secret"] as const)("creates a unique %s credential with a verifiable hash", async (keyType) => {
    const first = await createIngestionCredential(keyType);
    const second = await createIngestionCredential(keyType);

    expect(first.rawKey).toMatch(keyType === "public" ? /^jk_pub_[a-f0-9]{64}$/ : /^jk_sec_[a-f0-9]{64}$/);
    expect(first.keyPrefix).toBe(first.rawKey.slice(0, keyType === "public" ? 15 : 15));
    expect(first.keyHash).toBe(await hashIngestionCredential(first.rawKey));
    expect(first.keyHash).not.toContain(first.rawKey);
    expect(first.keyHash).not.toBe(second.keyHash);
  });
});
