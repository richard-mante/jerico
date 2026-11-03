import type { IngestionKeyType } from "@jerico/contracts";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashIngestionCredential(rawKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey));
  return toHex(new Uint8Array(digest));
}

export async function createIngestionCredential(keyType: IngestionKeyType) {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const prefix = keyType === "public" ? "jk_pub_" : "jk_sec_";
  const rawKey = prefix + toHex(random);

  return {
    rawKey,
    keyPrefix: rawKey.slice(0, prefix.length + 8),
    keyHash: await hashIngestionCredential(rawKey),
  };
}
