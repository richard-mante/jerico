function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
function encodeBase64Url(value: Uint8Array): string {
  const binary = Array.from(value, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function encryptWebhookSecret(secret: string, encodedKey: string | undefined): Promise<{ secretCiphertext: string; secretIv: string }> {
  if (!encodedKey) throw new Error("WEBHOOK_ENCRYPTION_KEY is not configured.");
  const rawKey = decodeBase64Url(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error("WEBHOOK_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
  return { secretCiphertext: encodeBase64Url(new Uint8Array(ciphertext)), secretIv: encodeBase64Url(iv) };
}
