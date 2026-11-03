import { describe, expect, it } from "vitest";
import { decryptWebhookSecret } from "../worker/webhook-delivery";
import { encryptWebhookSecret } from "./webhook-crypto";

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

describe("webhook secret encryption", () => {
  it("encrypts secrets with AES-GCM and only decrypts with the configured 256-bit key", async () => {
    const rawKey = new Uint8Array(32).map((_, index) => index + 1);
    const encodedKey = encodeBase64Url(rawKey);
    const encrypted = await encryptWebhookSecret("one-time-signing-secret", encodedKey);
    expect(encrypted.secretCiphertext).not.toContain("one-time-signing-secret");
    const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(atob(encrypted.secretIv.replaceAll("-", "+").replaceAll("_", "/") + "=="), (c) => c.charCodeAt(0)) },
      key,
      Uint8Array.from(atob(encrypted.secretCiphertext.replaceAll("-", "+").replaceAll("_", "/") + "=="), (c) => c.charCodeAt(0)),
    );
    expect(new TextDecoder().decode(plaintext)).toBe("one-time-signing-secret");
  });

  it("rejects missing or incorrectly sized encryption keys", async () => {
    await expect(encryptWebhookSecret("secret", undefined)).rejects.toThrow("WEBHOOK_ENCRYPTION_KEY");
    await expect(encryptWebhookSecret("secret", encodeBase64Url(new Uint8Array(16)))).rejects.toThrow("exactly 32 bytes");
  });
});
