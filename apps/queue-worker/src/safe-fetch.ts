import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { isIP, type LookupFunction } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

type ResolvedAddress = { address: string; family: 4 | 6 };

const BLOCKED_HOST_SUFFIXES = [
  ".localhost", ".local", ".internal", ".home.arpa", ".lan", ".corp",
  ".home", ".intranet", ".private", ".arpa", ".test", ".invalid",
  ".example", ".onion",
];
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((octets[0]! * 256 + octets[1]!) * 256 + octets[2]!) * 256 + octets[3]!) >>> 0;
}

function inIpv4Range(value: number, network: string, prefix: number): boolean {
  const base = ipv4Number(network);
  if (base === null) return true;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4Number(address);
  if (value === null) return false;
  const blocked: Array<[string, number]> = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
    ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
  ];
  return !blocked.some(([network, prefix]) => inIpv4Range(value, network, prefix));
}

function ipv6Number(address: string): bigint | null {
  let value = address.toLowerCase().split("%")[0] ?? "";
  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    if (separator < 0) return null;
    const ipv4 = ipv4Number(value.slice(separator + 1));
    if (ipv4 === null) return null;
    value = value.slice(0, separator + 1)
      + ((ipv4 >>> 16) & 0xffff).toString(16) + ":"
      + (ipv4 & 0xffff).toString(16);
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt("0x" + group), 0n);
}

function inIpv6Range(value: bigint, network: string, prefix: number): boolean {
  const base = ipv6Number(network);
  if (base === null) return true;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (base >> shift);
}

function isPublicIpv6(address: string): boolean {
  const value = ipv6Number(address);
  if (value === null) return false;

  // IPv4-mapped IPv6 addresses inherit the embedded IPv4 classification.
  if ((value >> 32n) === 0xffffn) {
    const embedded = Number(value & 0xffffffffn);
    const ipv4 = [
      (embedded >>> 24) & 255,
      (embedded >>> 16) & 255,
      (embedded >>> 8) & 255,
      embedded & 255,
    ].join(".");
    return isPublicIpv4(ipv4);
  }

  // Permit only global-unicast 2000::/3 and exclude special-purpose,
  // documentation, 6to4, and protocol-assignment ranges.
  const globalUnicast = (value >> 125n) === 1n;
  if (!globalUnicast) return false;
  const blocked = [
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2001:10::", 28],
    ["2001:20::", 28],
    ["2002::", 16],
  ] as const;
  return !blocked.some(([network, prefix]) => inIpv6Range(value, network, prefix));
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function validateTarget(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Only HTTP and HTTPS targets are supported.");
  }
  if (url.username || url.password || url.hash) throw new TypeError("Credentials and URL fragments are not allowed.");
  if (!ALLOWED_PORTS.has(url.port)) throw new TypeError("The target port is not allowed.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname.includes(".") || isIP(hostname) !== 0 || hostname.length > 253) {
    throw new TypeError("The target must use a public DNS hostname.");
  }
  if (["localhost", "metadata", "metadata.google.internal", "metadata.azure.internal", "instance-data"].includes(hostname)
      || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new TypeError("The target hostname is not public.");
  }
}

async function resolvePinnedAddress(hostname: string): Promise<ResolvedAddress> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      dnsLookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("DNS resolution timed out.")), 5_000);
      }),
    ]);
    if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
      throw new TypeError("The target resolved to a non-public IP address.");
    }
    const selected = records[0]!;
    return { address: selected.address, family: selected.family as 4 | 6 };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function pinnedLookup(address: ResolvedAddress): LookupFunction {
  return (( _hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (options?.all) {
      callback(null, [{ address: address.address, family: address.family }]);
    } else {
      callback(null, address.address, address.family);
    }
  }) as unknown as LookupFunction;
}

/**
 * Node fetch replacement for user-configured outbound targets. Resolves every
 * hostname, rejects private/reserved results, pins the selected public IP for
 * the socket, and never follows redirects automatically.
 */
export const safeFetch: typeof fetch = async (input, init = {}) => {
  const request = input instanceof Request ? input : undefined;
  const url = new URL(request?.url ?? String(input));
  validateTarget(url);
  if (init.redirect === "follow" || request?.redirect === "follow") {
    throw new TypeError("Automatic redirects are disabled for safe outbound requests.");
  }
  const address = await resolvePinnedAddress(url.hostname.replace(/^\[|\]$/g, ""));
  const method = (init.method ?? request?.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers ?? request?.headers);
  if (!headers.has("host")) headers.set("host", url.host);
  const body = init.body ?? null;
  if (body !== null && typeof body !== "string" && !(body instanceof Uint8Array) && !(body instanceof ArrayBuffer) && !(body instanceof URLSearchParams)) {
    throw new TypeError("Safe outbound requests support only bounded string or byte bodies.");
  }
  const bodyBytes = body === null ? null
    : typeof body === "string" ? Buffer.from(body)
    : body instanceof URLSearchParams ? Buffer.from(body.toString())
    : body instanceof ArrayBuffer ? Buffer.from(body)
    : Buffer.from(body);
  if (bodyBytes && bodyBytes.byteLength > 256 * 1024) throw new RangeError("Outbound request body exceeds 256 KiB.");
  if (bodyBytes && !headers.has("content-length")) headers.set("content-length", String(bodyBytes.byteLength));

  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
  const options = {
    protocol: url.protocol,
    hostname: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
    path: url.pathname + url.search,
    method,
    headers: Object.fromEntries(headers.entries()),
    lookup: pinnedLookup(address),
    servername: url.hostname.replace(/^\[|\]$/g, ""),
    agent: false as const,
    signal: init.signal ?? request?.signal,
  };

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const outgoing = transport(options, (incoming) => {
      const status = incoming.statusCode ?? 502;
      if (init.redirect === "error" || request?.redirect === "error") {
        if (status >= 300 && status < 400) {
          incoming.destroy();
          if (!settled) {
            settled = true;
            reject(new TypeError("Redirects are not allowed for safe outbound requests."));
          }
          return;
        }
      }
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item);
        else if (value !== undefined) responseHeaders.set(name, String(value));
      }
      const emptyBody = method === "HEAD" || status === 204 || status === 205 || status === 304;
      const responseBody = emptyBody
        ? null
        : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      if (emptyBody) incoming.destroy();
      settled = true;
      resolve(new Response(responseBody, {
        status,
        statusText: incoming.statusMessage,
        headers: responseHeaders,
      }));
    });
    outgoing.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    if (bodyBytes) outgoing.write(bodyBytes);
    outgoing.end();
  });
};
