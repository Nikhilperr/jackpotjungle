/**
 * Trigger GoTrue (Auth) to send mail — same path the browser uses.
 * Call Kong on localhost so we bypass public nginx 504 timeouts.
 */

function authBases(): string[] {
  const list = [
    process.env.SUPABASE_INTERNAL_URL,
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    process.env.SUPABASE_URL,
  ].filter(Boolean) as string[];
  return [...new Set(list.map((u) => u.replace(/\/$/, "")))];
}

function anonKey(): string {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  );
}

async function goTruePost(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 55000,
): Promise<{ ok: true; base: string } | { ok: false; error: string }> {
  const key = anonKey();
  if (!key) return { ok: false, error: "Missing anon/publishable key for Auth mailer." };

  let last = "No Auth base URL reachable.";
  for (const base of authBases()) {
    const url = `${base}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      console.log(`[GoTrueMail] POST ${url}`);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text().catch(() => "");
      if (res.ok) {
        console.log(`[GoTrueMail] OK via ${base} status=${res.status}`);
        return { ok: true, base };
      }
      last = `${res.status} ${text.slice(0, 180)}`;
      console.warn(`[GoTrueMail] ${url} → ${last}`);
      // 504 from public proxy — try next base (localhost)
      if (res.status === 504 || res.status === 502 || res.status === 408) continue;
    } catch (e: any) {
      last = e?.name === "AbortError" ? "timeout" : e?.message || String(e);
      console.warn(`[GoTrueMail] ${url} failed:`, last);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: last };
}

/** Login / email verification OTP (GoTrue mailer). */
export async function goTrueSendEmailOtp(email: string) {
  return goTruePost("/auth/v1/otp", { email, create_user: false });
}

/** Forgot-password recovery OTP (GoTrue mailer). */
export async function goTrueSendRecoveryOtp(email: string) {
  return goTruePost("/auth/v1/recover", { email });
}
