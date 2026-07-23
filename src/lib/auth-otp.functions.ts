import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushNotification } from "@/lib/fcm.server";
import { sendSmtpMail } from "@/lib/smtp.server";

/** Public VPS host — used when domain routing/nginx misbehaves. */
export const VPS_IP = "157.245.93.210";

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

function authBases(): string[] {
  const list = [
    process.env.SUPABASE_INTERNAL_URL,
    process.env.GOTRUE_URL,
    `http://${VPS_IP}:8000`,
    `http://127.0.0.1:8000`,
    `http://127.0.0.1:9999`,
    "http://kong:8000",
    "http://supabase-auth:9999",
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
  ]
    .filter(Boolean)
    .map((u) => String(u).replace(/\/$/, ""));
  return [...new Set(list)];
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
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

async function generateEmailOtp(email: string): Promise<{ code: string; userId?: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) {
    throw new Error(error.message || "Could not generate verification code on the VPS.");
  }
  const code = String((data as any)?.properties?.email_otp || (data as any)?.email_otp || "");
  const userId = String((data as any)?.user?.id || (data as any)?.id || "");
  if (code.length < 6) {
    throw new Error("Auth did not return an email code.");
  }
  return { code: code.slice(0, 8), userId: userId || undefined };
}

async function storeOtpMeta(userId: string | undefined, email: string, code: string) {
  if (!userId) return;
  try {
    const { data: wrapped } = await supabaseAdmin.auth.admin.getUserById(userId);
    const prev = wrapped?.user?.user_metadata || {};
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...prev,
        jj_login_otp_hash: hashCode(email, code),
        jj_login_otp_exp: Date.now() + 10 * 60 * 1000,
      },
    });
  } catch (e) {
    console.warn("[AuthOTP] store meta failed:", e);
  }
}

async function sendCodeViaPush(
  userId: string | undefined,
  code: string,
  extraToken?: string,
): Promise<boolean> {
  try {
    const tokens = new Set<string>();
    if (extraToken?.trim()) tokens.add(extraToken.trim());

    if (userId) {
      const { data: rows } = await supabaseAdmin
        .from("push_tokens" as any)
        .select("token")
        .eq("user_id", userId);
      for (const r of rows || []) {
        if ((r as any)?.token) tokens.add((r as any).token);
      }
    }

    const list = [...tokens];
    if (!list.length) return false;
    await sendPushNotification(
      list,
      "Verification code",
      `Your Jackpot Jungle code is ${code}`,
      { type: "login_otp", code },
    );
    console.log(`[AuthOTP] Sent code via FCM to ${list.length} device(s)`);
    return true;
  } catch (e) {
    console.warn("[AuthOTP] FCM send failed:", e);
    return false;
  }
}

/**
 * Login OTP for Capacitor/web:
 * - generateLink (works on VPS)
 * - deliver via FCM push (HTTPS — works when SMTP is blocked)
 * - best-effort email via Auth on VPS IP / SMTP
 */
export const sendLoginEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string; fcmToken?: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }

    const { code, userId } = await generateEmailOtp(email);
    await storeOtpMeta(userId, email, code);

    const channels: string[] = [];

    if (await sendCodeViaPush(userId, code, data.fcmToken)) {
      channels.push("push");
    }

    for (const base of authBases().slice(0, 4)) {
      try {
        const { res } = await fetchAuth(
          base,
          "/auth/v1/otp",
          { email, create_user: false },
          false,
          5000,
        );
        if (res.ok) {
          channels.push("email");
          break;
        }
      } catch {
        /* next */
      }
    }

    if (!channels.includes("email")) {
      try {
        await sendSmtpMail({
          to: email,
          fromName: "Jackpot Jungle",
          subject: `${code} is your Jackpot Jungle verification code`,
          text: `Your Jackpot Jungle verification code is: ${code}\n\nExpires in 10 minutes.`,
          html: `<div style="font-family:system-ui,sans-serif;padding:24px"><h2>Verify your sign-in</h2><p style="font-size:28px;letter-spacing:0.25em;font-weight:800">${code}</p></div>`,
        });
        channels.push("email");
      } catch (e: any) {
        console.warn("[AuthOTP] SMTP fallback failed:", e?.message || e);
      }
    }

    if (!channels.length) {
      throw new Error(
        "Could not deliver the code. Enable notifications in the app (push), or fix SMTP on the VPS Auth container.",
      );
    }

    console.log(`[AuthOTP] Delivered to ${email} via ${channels.join(",")}`);
    return { sent: true, via: channels, push: channels.includes("push"), email: channels.includes("email") };
  });

export const verifyLoginEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string; code: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    const code = data.code?.trim();
    if (!email || !code || code.length < 6) {
      throw new Error("Enter the 6-digit code.");
    }

    // GoTrue verify via public/API bases (including VPS IP Kong)
    for (const base of authBases()) {
      for (const type of ["email", "magiclink"] as const) {
        try {
          const { res } = await fetchAuth(
            base,
            "/auth/v1/verify",
            { type, email, token: code },
            false,
            8000,
          );
          if (res.ok) return { ok: true, via: type };
        } catch {
          /* next */
        }
      }
    }

    // Metadata fallback (code we stored + pushed)
    let userId: string | undefined;
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      userId = profile?.id;
    } catch {
      /* ignore */
    }

    if (userId) {
      const { data: wrapped } = await supabaseAdmin.auth.admin.getUserById(userId);
      const meta = wrapped?.user?.user_metadata || {};
      const exp = Number(meta.jj_login_otp_exp || 0);
      const hash = meta.jj_login_otp_hash;
      if (hash && exp > Date.now() && hash === hashCode(email, code)) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { ...meta, jj_login_otp_hash: null, jj_login_otp_exp: null },
        });
        return { ok: true, via: "meta" };
      }
    }

    throw new Error("Invalid or expired verification code.");
  });
