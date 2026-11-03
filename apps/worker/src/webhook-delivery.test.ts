import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverWebhook, isSafeWebhookUrl, signWebhookPayload } from "./webhook-delivery";

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

describe("webhook endpoint safety", () => {
  it("accepts public HTTPS endpoints and rejects private or unsafe targets", () => {
    expect(isSafeWebhookUrl("https://hooks.example.com/jerico")).toBe(true);
    expect(isSafeWebhookUrl("http://hooks.example.com/jerico")).toBe(false);
    expect(isSafeWebhookUrl("https://127.0.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://[::1]/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://service.internal/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://service.corp/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://hooks.example.com:8443/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://hooks.example.com/hook?token=secret")).toBe(false);
    expect(isSafeWebhookUrl("https://worker.example.com/hook", "worker.example.com")).toBe(false);
  });
});

describe("webhook signing and delivery", () => {
  afterEach(() => vi.restoreAllMocks());

  it("signs the timestamp and exact request body with HMAC-SHA256", async () => {
    const secret = new TextEncoder().encode("test-webhook-secret");
    const body = '{"type":"incident.opened"}';
    const timestamp = "1793700000";
    const signature = await signWebhookPayload(secret, body, timestamp);
    const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const bytes = Uint8Array.from(signature.slice("sha256=".length).match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
    const valid = await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(timestamp + "." + body));
    expect(valid).toBe(true);
  });

  it("sends a timestamped signature and stable delivery ID without following redirects", async () => {
    const rawKey = new Uint8Array(32).map((_, index) => index + 1);
    const aesKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const secret = new TextEncoder().encode("jerico-test-signing-secret");
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, secret));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await deliverWebhook({
      url: "https://hooks.example.com/jerico",
      secretCiphertext: encodeBase64Url(ciphertext),
      secretIv: encodeBase64Url(iv),
      encryptionKey: encodeBase64Url(rawKey),
      eventType: "incident.opened",
      deliveryId: "550e8400-e29b-41d4-a716-446655440000",
      incidentId: "incident-a",
      projectId: "project-a",
      title: "High error rate",
      triggerValue: 12,
      occurredAt: "2026-11-03T10:00:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://hooks.example.com/jerico");
    expect(init?.redirect).toBe("error");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-jerico-delivery")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(headers.get("x-jerico-timestamp")).toMatch(/^\d+$/);
    expect(headers.get("x-jerico-signature")).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(JSON.parse(String(init?.body))).toMatchObject({ id: "550e8400-e29b-41d4-a716-446655440000", type: "incident.opened" });
  });

  it("does not send when the endpoint is rejected by the URL guard", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(deliverWebhook({
      url: "http://hooks.example.com/jerico",
      secretCiphertext: "invalid",
      secretIv: "invalid",
      encryptionKey: "invalid",
      eventType: "incident.opened",
      deliveryId: "550e8400-e29b-41d4-a716-446655440000",
      incidentId: "incident-a",
      projectId: "project-a",
      title: "High error rate",
      triggerValue: 12,
      occurredAt: "2026-11-03T10:00:00.000Z",
    })).rejects.toThrow("Webhook URL is not an allowed public HTTPS endpoint.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
