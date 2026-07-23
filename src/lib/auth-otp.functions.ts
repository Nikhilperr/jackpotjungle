import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt } from "node:crypto";
import { sendSmtpMail } from "@/lib/smtp.server";

type OtpEntry = { hash: string; exp: number; via: "gotrue" | "smtp" };
const otpStore: Map<string, OtpEntry> =
  ((globalThis as any).__jjLoginOtpStore as Map<string, OtpEntry>) ||
  (((globalThis as any).__jjLoginOtpStore = new Map()), (globalThis as any).__jjLoginOtpStore);

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function authBase() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
}

function anonKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
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

async function gotrueFetch(path: string, body: Record<string, unknown>, useService = false) {
  const base = authBase();
  const key = useService ? serviceKey() || anonKey() : anonKey();
  if (!base || !key) throw new Error("Auth server is not configured.");

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

/**
 * Send login email OTP via GoTrue's mailer first (works on this VPS).
 * Fallback: admin generateLink + app SMTP (IPv4, GOTRUE_SMTP_*).
 */
export const sendLoginEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }

    // 1) Preferred: GoTrue /otp — uses Auth container SMTP (already proven live).
    try {
      const { res, json, text } = await withTimeout(
        gotrueFetch("/auth/v1/otp", { email, create_user: false }),
        10000,
        "Sending verification email",
      );

      if (res.ok || res.status === 200) {
        otpStore.set(email, {
          hash: "", // verified via GoTrue
          exp: Date.now() + 10 * 60 * 1000,
          via: "gotrue",
        });
        console.log(`[AuthOTP] Sent via GoTrue /otp to ${email}`);
        return { sent: true, via: "gotrue" as const };
      }

      if (res.status === 429) {
        throw new Error("Too many codes sent. Wait about a minute, then tap Resend code.");
      }

      const msg =
        (typeof json?.msg === "string" && json.msg) ||
        (typeof json?.message === "string" && json.message) ||
        (typeof json?.error_description === "string" && json.error_description) ||
        text?.slice(0, 120) ||
        `Auth mailer returned ${res.status}`;
      console.warn(`[AuthOTP] GoTrue /otp failed ${res.status}: ${msg}`);
      // Fall through to SMTP fallback unless hard rate-limit style message
      if (/rate limit|too many/i.test(msg)) {
        throw new Error("Too many codes sent. Wait about a minute, then tap Resend code.");
      }
    } catch (e: any) {
      // Rate-limit is definitive — don't spam SMTP too.
      if (typeof e?.message === "string" && /Too many codes/i.test(e.message)) {
        throw e;
      }
      console.warn("[AuthOTP] GoTrue /otp error, trying SMTP fallback:", e?.message || e);
    }

    // 2) Fallback: generate 6-digit code (or from generateLink) + SMTP
    let code = String(randomInt(100000, 999999));
    try {
      const { res, json } = await withTimeout(
        gotrueFetch(
          "/auth/v1/admin/generate_link",
          { type: "magiclink", email },
          true,
        ),
        8000,
        "Generating verification code",
      );
      if (res.ok && json?.email_otp) {
        code = String(json.email_otp);
      }
    } catch (e: any) {
      console.warn("[AuthOTP] generate_link failed, using local code:", e?.message || e);
    }

    otpStore.set(email, {
      hash: hashCode(email, code),
      exp: Date.now() + 10 * 60 * 1000,
      via: "smtp",
    });

    await withTimeout(
      sendSmtpMail({
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
      14000,
      "Sending email",
    );

    console.log(`[AuthOTP] Sent via SMTP fallback to ${email}`);
    return { sent: true, via: "smtp" as const };
  });

export const verifyLoginEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string; code: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    const code = data.code?.trim();
    if (!email || !code || code.length < 6) {
      throw new Error("Enter the 6-digit code from your email.");
    }

    const entry = otpStore.get(email);

    // Always try GoTrue verify first (codes sent by /otp or generateLink magiclink).
    for (const type of ["email", "magiclink"] as const) {
      try {
        const { res, json } = await withTimeout(
          gotrueFetch("/auth/v1/verify", {
            type,
            email,
            token: code,
          }),
          8000,
          "Verifying code",
        );
        if (res.ok) {
          otpStore.delete(email);
          return { ok: true, via: "gotrue" as const };
        }
        // Invalid token → try next type / fallback
        if (res.status !== 401 && res.status !== 403 && res.status !== 422) {
          const msg = json?.msg || json?.message || `Verify failed (${res.status})`;
          console.warn(`[AuthOTP] verify type=${type}: ${msg}`);
        }
      } catch (e: any) {
        console.warn(`[AuthOTP] verify type=${type} error:`, e?.message || e);
      }
    }

    // App SMTP fallback codes
    if (entry?.via === "smtp" && entry.hash && entry.exp >= Date.now()) {
      if (entry.hash === hashCode(email, code)) {
        otpStore.delete(email);
        return { ok: true, via: "smtp" as const };
      }
      throw new Error("Invalid verification code.");
    }

    if (entry && entry.exp < Date.now()) {
      otpStore.delete(email);
      throw new Error("Code expired. Tap Resend code for a new one.");
    }

    throw new Error("Invalid or expired verification code. Tap Resend code and try again.");
  });
