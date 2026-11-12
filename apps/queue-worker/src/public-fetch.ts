import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch } from "undici";

type ResolvedAddress = { address: string; family: number };
type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | ResolvedAddress[],
  family?: number,
) => void;

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}

async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress> {
  if (!hostname || hostname.startsWith("[") || ipaddr.isValid(hostname)) {
    throw new Error("Public outbound requests must use a DNS hostname, not an IP literal.");
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Outbound hostname resolved to a non-public or unsupported address.");
  }
  return addresses[0]!;
}

function closeAfterBody(response: Response, dispatcher: Agent): Response {
  if (!response.body) {
    void dispatcher.close();
    return response;
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          controller.close();
          await dispatcher.close();
        } else controller.enqueue(result.value);
      } catch (error) {
        controller.error(error);
        await dispatcher.destroy(error instanceof Error ? error : undefined);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await dispatcher.close();
      }
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** Pin each request to a validated public DNS address; callers must revalidate redirects. */
export async function fetchPublicPinned(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = input instanceof Request ? new URL(input.url) : new URL(input.toString());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP(S) outbound requests are supported.");
  if (url.username || url.password) throw new Error("Outbound URLs must not contain embedded credentials.");

  const pinned = await resolvePublicAddress(url.hostname);
  const lookupPinned = (_hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
    if (options?.all) callback(null, [pinned]);
    else callback(null, pinned.address, pinned.family);
  };
  const dispatcher = new Agent({
    connect: { lookup: lookupPinned as never },
    connections: 1,
    pipelining: 0,
  });
  try {
    const response = await undiciFetch(url, { ...init, dispatcher, redirect: init.redirect ?? "manual" });
    return closeAfterBody(response, dispatcher);
  } catch (error) {
    await dispatcher.destroy(error instanceof Error ? error : undefined);
    throw error;
  }
}
