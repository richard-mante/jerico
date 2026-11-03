const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const NUMERIC_ID_SEGMENT = /^\d{5,}$/;

export function normalizeRoutePath(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  const normalized = pathOnly.split("/").map((segment) => {
    if (UUID_SEGMENT.test(segment) || LONG_HEX_SEGMENT.test(segment) || NUMERIC_ID_SEGMENT.test(segment)) return ":id";
    return segment.slice(0, 128);
  }).join("/");
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.slice(0, 512) || "/";
}

export function resolveRoutePath(pathname: string, resolver?: (pathname: string) => string): string {
  try {
    const resolved = resolver?.(pathname);
    if (typeof resolved === "string" && resolved.trim()) return normalizeRoutePath(resolved);
  } catch {
    // An application resolver must not interrupt telemetry capture.
  }
  return normalizeRoutePath(pathname);
}
