export type WebhookDeliveryInput = {
  url: string;
  secretCiphertext: string;
  secretIv: string;
  encryptionKey?: string;
  blockedHost?: string;
  eventType: string;
  deliveryId: string;
  incidentId: string;
  projectId: string;
  title: string;
  triggerValue: number;
  occurredAt: string;
};

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function isSafeWebhookUrl(value: string, blockedHost?: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || url.search || url.hash) return false;
    if (!host.includes(".") || host.length > 253 || host.startsWith("[") || host.includes(":")) return false;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return false;
    if (["localhost", "metadata", "metadata.google.internal", "metadata.azure.internal", "instance-data"].includes(host)) return false;
    if ([".localhost", ".local", ".internal", ".test", ".invalid", ".example", ".home.arpa", ".lan", ".corp", ".home", ".intranet", ".private", ".arpa", ".onion"].some((suffix) => host.endsWith(suffix))) return false;
    if (blockedHost && host === blockedHost.toLowerCase()) return false;
    return true;
  } catch {
    return false;
  }
}

export async function decryptWebhookSecret(ciphertext: string, ivValue: string, encodedKey?: string): Promise<Uint8Array> {
  if (!encodedKey) throw new Error("Webhook encryption key is not configured.");
  const rawKey = decodeBase64Url(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error("Webhook encryption key is invalid.");
  const iv = decodeBase64Url(ivValue);
  if (iv.byteLength !== 12) throw new Error("Webhook encryption IV is invalid.");
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, decodeBase64Url(ciphertext));
  return new Uint8Array(decrypted);
}

export async function signWebhookPayload(secret: Uint8Array, body: string, timestamp: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signedPayload = timestamp + "." + body;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload)));
  return "sha256=" + Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deliverWebhook(input: WebhookDeliveryInput): Promise<void> {
  if (!isSafeWebhookUrl(input.url, input.blockedHost)) throw new Error("Webhook URL is not an allowed public HTTPS endpoint.");
  const secret = await decryptWebhookSecret(input.secretCiphertext, input.secretIv, input.encryptionKey);
  const body = JSON.stringify({
    id: input.deliveryId,
    type: input.eventType,
    occurredAt: input.occurredAt,
    data: {
      incidentId: input.incidentId,
      projectId: input.projectId,
      title: input.title,
      triggerValue: input.triggerValue,
    },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signWebhookPayload(secret, body, timestamp);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(input.url, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-jerico-event": input.eventType,
        "x-jerico-delivery": input.deliveryId,
        "x-jerico-signature": signature,
        "x-jerico-timestamp": timestamp,
      },
      body,
    });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error("Webhook endpoint rejected the event.");
  } finally {
    clearTimeout(timeout);
  }
}
