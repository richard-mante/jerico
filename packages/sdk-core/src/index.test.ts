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
  it("adds a validated severity to structured logs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const client = new JericoClient({ apiKey: "jk_sec_test", endpoint: "https://ingest.example.test", fetch: fetcher, flushIntervalMs: 0 });
    client.log("request.completed", "Request completed", { route: "/health" });
    client.logWithLevel("warn", "request.slow", "Request took too long", { durationMs: 1200 });
    await client.flush();
    const events = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).events;
    expect(events[0].attributes.level).toBe("info");
    expect(events[1].attributes.level).toBe("warn");
    expect(events[1].attributes.durationMs).toBe(1200);
    await client.close();
  });
});
