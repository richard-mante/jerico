import { describe, expect, it, vi } from "vitest";
import { JericoClient, JericoHttpError } from "./index";

describe("JericoClient", () => {
  it("posts a batch to the configured ingestion endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const client = new JericoClient({ apiKey: "jk_pub_test", endpoint: "https://ingest.example.test", fetch: fetcher, flushIntervalMs: 0 });
    client.track("signup", { method: "email" });
    await client.flush();
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://ingest.example.test/ingest/v1/events");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer jk_pub_test");
    expect(new Headers(init?.headers).get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.parse(String(init?.body)).events[0].name).toBe("signup");
    await client.close();
  });

  it("retains a failed batch for an explicit later flush", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "10" } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const client = new JericoClient({ apiKey: "jk_pub_test", endpoint: "https://ingest.example.test", fetch: fetcher, flushIntervalMs: 0 });
    client.track("signup");
    await expect(client.flush()).rejects.toBeInstanceOf(JericoHttpError);
    await client.flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstRequest = fetcher.mock.calls[0]![1]!;
    const secondRequest = fetcher.mock.calls[1]![1]!;
    expect(new Headers(firstRequest.headers).get("idempotency-key"))
      .toBe(new Headers(secondRequest.headers).get("idempotency-key"));
    expect(firstRequest.body).toBe(secondRequest.body);
    await client.close();
  });

  it("validates event bounds before sending", () => {
    const client = new JericoClient({ apiKey: "key", endpoint: "https://ingest.example.test", flushIntervalMs: 0 });
    expect(() => client.track("x".repeat(161))).toThrow();
    expect(() => client.track("valid", { detail: "x".repeat(2049) })).toThrow();
  });

  it("validates batch size and metric values", () => {
    expect(() => new JericoClient({ apiKey: "key", endpoint: "https://ingest.example.test", maxBatchSize: 101 })).toThrow();
    const client = new JericoClient({ apiKey: "key", endpoint: "https://ingest.example.test", flushIntervalMs: 0 });
    expect(() => client.metric("latency", Number.NaN)).toThrow();
  });
});
