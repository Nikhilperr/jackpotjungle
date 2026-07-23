/**
 * Turn auth/API failures into a human toast string.
 * Self-hosted GoTrue sometimes returns an empty JSON body → message becomes "{}".
 */
export function formatAuthError(err: unknown, fallback: string): string {
  if (err == null) return fallback;

  if (typeof err === "string") {
    const t = err.trim();
    if (!t || t === "{}" || t === "null" || t === "[object Object]") return fallback;
    return t;
  }

  const anyErr = err as Record<string, unknown>;

  const candidates = [
    anyErr.message,
    anyErr.msg,
    anyErr.error_description,
    typeof anyErr.error === "string" ? anyErr.error : undefined,
    anyErr.statusText,
  ];

  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (!t || t === "{}" || t === "null" || t === "[object Object]") continue;
    return t;
  }

  // Nested { error: { message } } shapes from some proxies
  const nested = anyErr.error;
  if (nested && typeof nested === "object") {
    const nestedMsg = formatAuthError(nested, "");
    if (nestedMsg) return nestedMsg;
  }

  return fallback;
}
