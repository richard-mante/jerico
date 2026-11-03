export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashTelemetryRequest(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}

export async function createStableEventId(
  credentialId: string,
  idempotencyKey: string,
  requestHash: string,
  eventIndex: number,
): Promise<string> {
  return sha256Hex(`jerico:event:${credentialId}:${idempotencyKey}:${requestHash}:${eventIndex}`);
}

export function isValidIdempotencyKey(value: string): boolean {
  return value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
