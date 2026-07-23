import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushNotification } from "@/lib/fcm.server";
import { sendSmtpMail } from "@/lib/smtp.server";

/** Public VPS host (Kong / nginx). */
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

async function assertSessionOwnsEmail(userId: string, email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error("Unauthorized.");
  const sessionEmail = (data.user.email || "").trim().toLowerCase();
  if (!sessionEmail || sessionEmail !== email) {
    throw new Error("Unauthorized: email does not match the signed-in account.");
  }
  return data.user;
}

/**
 * Send login OTP — ONLY after password sign-in (Bearer session required).
 * Push goes only to push_tokens already registered for that user_id.
 * Never accepts a client-supplied FCM token (that would let anyone steal OTPs).
 */
export const sendLoginEmailOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { email: string }) => d)
  .handler(async ({ data, context }) => {
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }

    const user = await assertSessionOwnsEmail(context.userId, email);

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) {
      throw new Error(linkErr.message || "Could not generate verification code.");
    }

    const code = String(
      (linkData as any)?.properties?.email_otp || (linkData as any)?.email_otp || "",
    ).slice(0, 8);
    if (code.length < 6) {
      throw new Error("Auth did not return an email code.");
    }

    const prev = user.user_metadata || {};
    await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: {
        ...prev,
        jj_login_otp_hash: hashCode(email, code),
        jj_login_otp_exp: Date.now() + 10 * 60 * 1000,
      },
    });

    const channels: string[] = [];

    // Push ONLY to devices already bound to this user in the DB
    try {
      const { data: rows } = await supabaseAdmin
        .from("push_tokens" as any)
        .select("token")
        .eq("user_id", context.userId);
      const tokens = (rows || []).map((r: any) => r.token).filter(Boolean);
      if (tokens.length) {
        await sendPushNotification(
          tokens,
          "Verification code",
          `Your Jackpot Jungle code is ${code}`,
          { type: "login_otp" }, // never put the code in data payload for other apps to scrape casually — body is enough for the owner
        );
        channels.push("push");
      }
    } catch (e) {
      console.warn("[AuthOTP] FCM send failed:", e);
    }

    // Best-effort email (may 504 / connection timeout on this VPS)
    for (const base of authBases().slice(0, 3)) {
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
        console.warn("[AuthOTP] SMTP failed:", e?.message || e);
      }
    }

    if (!channels.length) {
      throw new Error(
        "Could not deliver the code. Fix VPS Auth SMTP, or sign in once on a device with notifications already enabled for this account.",
      );
    }

    console.log(`[AuthOTP] user=${context.userId} via=${channels.join(",")}`);
    return { sent: true, via: channels, push: channels.includes("push"), email: channels.includes("email") };
  });

/**
 * Verify login OTP — requires the same password session; does not open account takeover.
 */
export const verifyLoginEmailOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { email: string; code: string }) => d)
  .handler(async ({ data, context }) => {
    const email = data.email?.trim().toLowerCase();
    const code = data.code?.trim();
    if (!email || !code || code.length < 6) {
      throw new Error("Enter the 6-digit code.");
    }

    await assertSessionOwnsEmail(context.userId, email);

    const { data: wrapped } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const meta = wrapped?.user?.user_metadata || {};
    const exp = Number(meta.jj_login_otp_exp || 0);
    const hash = meta.jj_login_otp_hash;

    if (hash && exp > Date.now() && hash === hashCode(email, code)) {
      await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        user_metadata: { ...meta, jj_login_otp_hash: null, jj_login_otp_exp: null },
      });
      return { ok: true, via: "meta" };
    }

    // Also accept GoTrue email/magiclink codes for this same account
    for (const base of authBases().slice(0, 3)) {
      for (const type of ["email", "magiclink"] as const) {
        try {
          const { res } = await fetchAuth(
            base,
            "/auth/v1/verify",
            { type, email, token: code },
            false,
            8000,
          );
          if (res.ok) {
            await supabaseAdmin.auth.admin.updateUserById(context.userId, {
              user_metadata: { ...meta, jj_login_otp_hash: null, jj_login_otp_exp: null },
            });
            return { ok: true, via: type };
          }
        } catch {
          /* next */
        }
      }
    }

    throw new Error("Invalid or expired verification code.");
  });
