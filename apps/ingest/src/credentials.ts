import { createHash } from "node:crypto";

export function hashPresentedCredential(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function readBearerCredential(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer (jk_(?:pub|sec)_[a-f0-9]{64})$/i.exec(header.trim());
  return match?.[1] ?? null;
}
