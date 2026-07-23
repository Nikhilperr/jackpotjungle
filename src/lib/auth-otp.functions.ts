import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt } from "node:crypto";
import { sendTransactionalMail } from "@/lib/mail.server";

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function authBase() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out. Try again.`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const base = authBase();
  const key = serviceKey();
  if (!base || !key) throw new Error("Auth server is not configured.");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text };
  }
  return { res, json, text };
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  // generate_link is reliable on this host and returns the user id.
  const gen = await adminFetch("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (gen.res.ok && gen.json?.id) return String(gen.json.id);
  return null;
}

async function storeOtpForUser(userId: string, email: string, code: string) {
  const exp = Date.now() + 10 * 60 * 1000;
  const current = await adminFetch(`/auth/v1/admin/users/${userId}`, { method: "GET" });
  const prev = current.json?.user_metadata || {};
  const { res, json } = await adminFetch(`/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({
      user_metadata: {
        ...prev,
        jj_login_otp_hash: hashCode(email, code),
        jj_login_otp_exp: exp,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(json?.msg || json?.message || "Could not store verification code.");
  }
  return exp;
}

async function readStoredOtp(userId: string): Promise<{ hash: string; exp: number } | null> {
  const { res, json } = await adminFetch(`/auth/v1/admin/users/${userId}`, { method: "GET" });
  if (!res.ok) return null;
  const meta = json?.user_metadata || json?.raw_user_meta_data || {};
  const hash = meta.jj_login_otp_hash;
  const exp = Number(meta.jj_login_otp_exp || 0);
  if (!hash || !exp) return null;
  return { hash, exp };
}

async function clearStoredOtp(userId: string) {
  await adminFetch(`/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({
      user_metadata: {
        jj_login_otp_hash: null,
        jj_login_otp_exp: null,
      },
    }),
  }).catch(() => {});
}

/**
 * App-level login email OTP after password auth.
 * Delivers via Resend/Brevo HTTPS (SMTP is blocked on this VPS).
 */
export const sendLoginEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }

    const userId = await withTimeout(findUserIdByEmail(email), 8000, "Account lookup");
    if (!userId) throw new Error("No account found for that email.");

    const code = String(randomInt(100000, 999999));
    await withTimeout(storeOtpForUser(userId, email, code), 8000, "Saving code");

    const mail = await withTimeout(
      sendTransactionalMail({
        to: email,
        fromName: "Jackpot Jungle",
        subject: `${code} is your Jackpot Jungle verification code`,
        text:
          `Your Jackpot Jungle verification code is: ${code}\n\n` +
          `This code expires in 10 minutes. If you did not try to sign in, ignore this email.`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="margin: 0 0 12px; color: #111;">Verify your sign-in</h2>
            <p style="color: #444; font-size: 14px; line-height: 1.5;">
              Use this code to finish signing in to Jackpot Jungle Messenger:
            </p>
            <div style="font-size: 32px; letter-spacing: 0.35em; font-weight: 800; text-align: center;
                        background: #f4f4f5; border-radius: 12px; padding: 16px 12px; margin: 20px 0; color: #111;">
              ${code}
            </div>
            <p style="color: #888; font-size: 12px;">Expires in 10 minutes.</p>
          </div>
        `,
      }),
      15000,
      "Sending email",
    );

    console.log(`[AuthOTP] Sent login OTP to ${email} via ${mail.via}`);
    return { sent: true, via: mail.via };
  });

export const verifyLoginEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string; code: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    const code = data.code?.trim();
    if (!email || !code || code.length < 6) {
      throw new Error("Enter the 6-digit code from your email.");
    }

    const userId = await withTimeout(findUserIdByEmail(email), 8000, "Account lookup");
    if (!userId) throw new Error("No account found for that email.");

    const stored = await withTimeout(readStoredOtp(userId), 8000, "Reading code");
    if (!stored || stored.exp < Date.now()) {
      await clearStoredOtp(userId);
      throw new Error("Code expired. Tap Resend code for a new one.");
    }
    if (stored.hash !== hashCode(email, code)) {
      throw new Error("Invalid verification code.");
    }

    await clearStoredOtp(userId);
    return { ok: true };
  });
