import { createServerFn } from "@tanstack/react-start";
import { sendSmtpMail, loadSmtpConfig } from "@/lib/smtp.server";

function anonKey() {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.ANON_KEY ||
    ""
  );
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || "";
}

/** Auth bases to try from the VPS process (Docker/Kong first — same network as mailer). */
function authBases(): string[] {
  const list = [
    process.env.SUPABASE_INTERNAL_URL,
    process.env.GOTRUE_URL,
    process.env.AUTH_INTERNAL_URL,
    "http://127.0.0.1:9999", // GoTrue direct (common self-host)
    "http://127.0.0.1:8000", // Kong
    "http://kong:8000",
    "http://supabase-auth:9999",
    "http://auth:9999",
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
  ]
    .filter(Boolean)
    .map((u) => String(u).replace(/\/$/, ""));
  return [...new Set(list)];
}

async function fetchAuth(
  base: string,
  path: string,
  body: Record<string, unknown>,
  useService: boolean,
  timeoutMs: number,
) {
  const key = useService ? serviceKey() || anonKey() : anonKey();
  if (!key) throw new Error("Missing Auth API key on server.");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { message: text };
    }
    return { res, json, text, base };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Send login OTP using the VPS Auth mailer (Docker network), not the Nitro host SMTP.
 * Host nodemailer hits "Connection timeout" because SMTP is only reachable from Auth's network.
 */
export const sendLoginEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }

    const bases = authBases();
    const errors: string[] = [];

    // 1) Preferred: GoTrue /otp via internal URL (same path browser uses, without public nginx 504).
    for (const base of bases) {
      try {
        const { res, json, text } = await fetchAuth(
          base,
          "/auth/v1/otp",
          { email, create_user: false },
          false,
          12000,
        );
        if (res.ok || res.status === 200) {
          console.log(`[AuthOTP] Sent via GoTrue /otp at ${base}`);
          return { sent: true, via: "gotrue-otp", base };
        }
        if (res.status === 429) {
          throw new Error("Too many codes sent. Wait about a minute, then tap Resend.");
        }
        const msg = json?.msg || json?.message || text?.slice(0, 120) || `HTTP ${res.status}`;
        errors.push(`${base}/otp: ${msg}`);
        console.warn(`[AuthOTP] /otp at ${base} → ${res.status} ${msg}`);
      } catch (e: any) {
        if (typeof e?.message === "string" && /Too many codes/i.test(e.message)) throw e;
        errors.push(`${base}/otp: ${e?.name === "AbortError" ? "timeout" : e?.message || e}`);
      }
    }

    // 2) Fallback: magiclink endpoint (also uses Auth mailer).
    for (const base of bases) {
      try {
        const { res, json, text } = await fetchAuth(
          base,
          "/auth/v1/magiclink",
          { email },
          false,
          12000,
        );
        if (res.ok || res.status === 200) {
          console.log(`[AuthOTP] Sent via GoTrue /magiclink at ${base}`);
          return { sent: true, via: "gotrue-magiclink", base };
        }
        if (res.status === 429) {
          throw new Error("Too many codes sent. Wait about a minute, then tap Resend.");
        }
        const msg = json?.msg || json?.message || text?.slice(0, 120) || `HTTP ${res.status}`;
        errors.push(`${base}/magiclink: ${msg}`);
      } catch (e: any) {
        if (typeof e?.message === "string" && /Too many codes/i.test(e.message)) throw e;
        errors.push(`${base}/magiclink: ${e?.name === "AbortError" ? "timeout" : e?.message || e}`);
      }
    }

    // 3) Last resort: generateLink + host SMTP (often fails with Connection timeout on DO).
    try {
      let code = "";
      for (const base of bases) {
        try {
          const { res, json } = await fetchAuth(
            base,
            "/auth/v1/admin/generate_link",
            { type: "magiclink", email },
            true,
            8000,
          );
          if (res.ok) {
            code = String(json?.email_otp || json?.properties?.email_otp || "");
            if (code) break;
          }
        } catch {
          /* try next base */
        }
      }
      if (code && code.length >= 6) {
        const cfg = loadSmtpConfig();
        console.log(`[AuthOTP] Trying host SMTP ${cfg.host}:${cfg.port} as last resort`);
        await sendSmtpMail({
          to: email,
          fromName: "Jackpot Jungle",
          subject: `${code} is your Jackpot Jungle verification code`,
          text: `Your Jackpot Jungle verification code is: ${code}\n\nExpires in a few minutes.`,
          html: `<div style="font-family:system-ui,sans-serif;padding:24px"><h2>Verify your sign-in</h2><p style="font-size:28px;letter-spacing:0.3em;font-weight:800">${code}</p></div>`,
        });
        return { sent: true, via: "smtp-fallback" };
      }
    } catch (e: any) {
      errors.push(`smtp-fallback: ${e?.message || e}`);
    }

    console.error("[AuthOTP] All send paths failed:", errors.join(" | "));
    throw new Error(
      "Could not send the verification email from the VPS Auth mailer. Check GoTrue SMTP in supabase/docker/.env and that Auth is reachable on localhost.",
    );
  });
