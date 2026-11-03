import { afterEach, describe, expect, it, vi } from "vitest";
import { probeEndpoint, validateProbeUrl } from "./uptime-probe";

describe("uptime target validation", () => {
  it.each([
    "ftp://example.com",
    "http://localhost/health",
    "http://service.internal/health",
    "http://127.0.0.1/health",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/health",
    "https://user:pass@example.com",
    "https://example.com:22",
  ])("rejects unsafe target %s", (url) => {
    expect(validateProbeUrl(url)).toBeNull();
  });

  it("blocks the probe worker hostname and accepts public HTTP(S) hostnames", () => {
    expect(validateProbeUrl("https://jerico-worker.account.workers.dev/health", ["jerico-worker.account.workers.dev"])).toBeNull();
    expect(validateProbeUrl("https://status.example.com:8443/health#section")?.hash).toBe("");
  });
});

describe("uptime endpoint probe", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses manual redirects and returns only bounded response metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("secret response body", { status: 204 }));
    const result = await probeEndpoint({ url: "https://status.example.com/health", method: "GET", timeoutMs: 1000, expectedStatusCode: 204 }, fetchMock);
    expect(result).toMatchObject({ status: "up", statusCode: 204, errorCode: null });
    expect(result.responseTimeMs).toEqual(expect.any(Number));
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual", method: "GET" }));
  });

  it("blocks redirects to private or local destinations before following them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }));
    const result = await probeEndpoint({ url: "https://status.example.com", method: "HEAD", timeoutMs: 1000, expectedStatusCode: 200 }, fetchMock);
    expect(result).toMatchObject({ status: "down", errorCode: "unsafe_redirect" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("limits redirect chains", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: URL) => new Response(null, {
      status: 302,
      headers: { location: url.pathname === "/3" ? "/4" : "/3" },
    }));
    const result = await probeEndpoint({ url: "https://status.example.com/3", method: "HEAD", timeoutMs: 1000, expectedStatusCode: 200 }, fetchMock);
    expect(result.errorCode).toBe("redirect_limit");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
