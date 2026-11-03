export type UptimeProbeInput = {
  url: string;
  method: "GET" | "HEAD";
  timeoutMs: number;
  expectedStatusCode: number;
};

export type UptimeProbeResult = {
  status: "up" | "down";
  statusCode: number | null;
  responseTimeMs: number | null;
  errorCode: string | null;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.azure.internal",
  "instance-data",
]);

export function validateProbeUrl(value: string): URL | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.hostname.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)) return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname.includes(".") || BLOCKED_HOSTS.has(hostname)) return null;
  if ([".localhost", ".local", ".internal", ".home.arpa", ".test", ".invalid", ".example", ".onion"].some((suffix) => hostname.endsWith(suffix))) return null;
  if (!ALLOWED_PORTS.has(url.port)) return null;
  url.hash = "";
  return url;
}

function failed(errorCode: string, responseTimeMs: number): UptimeProbeResult {
  return { status: "down", statusCode: null, responseTimeMs, errorCode };
}

export async function probeEndpoint(
  input: UptimeProbeInput,
  fetcher: typeof fetch = fetch,
): Promise<UptimeProbeResult> {
  const startedAt = performance.now();
  let currentUrl = validateProbeUrl(input.url);
  if (!currentUrl) return failed("unsafe_target", 0);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
      const response = await fetcher(currentUrl, {
        method: input.method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "*/*",
          "user-agent": "Jerico-Uptime/1.0",
        },
      });
      const elapsed = Math.max(0, Math.round(performance.now() - startedAt));
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location || redirectCount === 3) return failed("redirect_limit", elapsed);
        const nextUrl = validateProbeUrl(new URL(location, currentUrl).toString());
        if (!nextUrl) return failed("unsafe_redirect", elapsed);
        currentUrl = nextUrl;
        continue;
      }
      await response.body?.cancel().catch(() => undefined);
      return {
        status: response.status === input.expectedStatusCode ? "up" : "down",
        statusCode: response.status,
        responseTimeMs: elapsed,
        errorCode: response.status === input.expectedStatusCode ? null : "unexpected_status",
      };
    }
    return failed("redirect_limit", Math.max(0, Math.round(performance.now() - startedAt)));
  } catch {
    const elapsed = Math.max(0, Math.round(performance.now() - startedAt));
    return failed(controller.signal.aborted ? "timeout" : "network_error", elapsed);
  } finally {
    clearTimeout(timeout);
  }
}
