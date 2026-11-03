import { describe, expect, it, vi } from "vitest";
import { JericoClient, JericoHttpError } from "./index";

describe("JericoClient", () => {
  it("posts a batch to the configured ingestion endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const client = new JericoClient({ apiKey: "jk_pub_test", fetch: fetcher, flushIntervalMs: 0 });
    client.track("signup", { method: "email" });
    await client.flush();
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://ingest.jerico.dev/ingest/v1/events");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer jk_pub_test");
    expect(JSON.parse(String(init?.body)).events[0].name).toBe("signup");
    await client.close();
  });

  it("retains a failed batch for an explicit later flush", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "10" } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const client = new JericoClient({ apiKey: "jk_pub_test", fetch: fetcher, flushIntervalMs: 0 });
    client.track("signup");
    await expect(client.flush()).rejects.toBeInstanceOf(JericoHttpError);
    await client.flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await client.close();
  });

  it("validates batch size and metric values", () => {
    expect(() => new JericoClient({ apiKey: "key", maxBatchSize: 101 })).toThrow();
    const client = new JericoClient({ apiKey: "key", flushIntervalMs: 0 });
    expect(() => client.metric("latency", Number.NaN)).toThrow();
  });
});
