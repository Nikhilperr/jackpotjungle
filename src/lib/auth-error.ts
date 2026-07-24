/**
 * Turn auth/API failures into a human toast string.
 * Self-hosted GoTrue / nginx often return empty JSON or HTML 504 bodies.
 */
export function formatAuthError(err: unknown, fallback: string): string {
  if (err == null) return fallback;

  const scrub = (raw: string) => {
    const t = raw.trim();
    if (!t || t === "{}" || t === "null" || t === "[object Object]") return "";
    // nginx / gateway HTML error pages
    if (/GoogleAuth Native Bridge Timeout|plugin did not respond|took too long|session.*timeout/i.test(t)) {
      return "Google sign-in took too long. Please tap Continue with Google once more.";
    }
    if (/connection timeout|etimedout|econnrefused|enotfound/i.test(t)) {
      return "Mail server connection timed out on the VPS. Rebuild the app so OTP uses the Auth mailer, then try Resend.";
    }
    if (/<html|<!doctype|504 Gateway|502 Bad Gateway|503 Service/i.test(t)) {
      if (/504/i.test(t)) return "Server timed out sending the email. Please try Resend in a moment.";
      if (/502|503/i.test(t)) return "Server is briefly unavailable. Please try again.";
      return fallback;
    }
    // Truncate huge blobs
    return t.length > 180 ? `${t.slice(0, 180)}…` : t;
  };

  if (typeof err === "string") {
    return scrub(err) || fallback;
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
    const cleaned = scrub(c);
    if (cleaned) return cleaned;
  }

  const nested = anyErr.error;
  if (nested && typeof nested === "object") {
    const nestedMsg = formatAuthError(nested, "");
    if (nestedMsg) return nestedMsg;
  }

  return fallback;
}
