import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalMail } from "@/lib/mail.server";

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function makeSixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
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

/** Remove all MFA factors for a user (used after password reset). */
export async function disableAllMfaFactorsForUser(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) {
    console.warn("[MFA] listFactors failed:", error.message);
    return 0;
  }
  const factors = (data as any)?.factors || [];
  let removed = 0;
  for (const f of factors) {
    if (!f?.id) continue;
    const { error: delErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
      id: f.id,
      userId,
    });
    if (delErr) {
      console.warn("[MFA] deleteFactor failed:", delErr.message);
    } else {
      removed += 1;
    }
  }
  return removed;
}

async function sendCodeEmail(opts: {
  email: string;
  code: string;
  kind: "login" | "recovery";
}) {
  const isLogin = opts.kind === "login";
  return sendTransactionalMail({
    to: opts.email,
    fromName: "Jackpot Jungle",
    subject: isLogin
      ? `${opts.code} is your Jackpot Jungle verification code`
      : `${opts.code} is your Jackpot Jungle password reset code`,
    text: isLogin
      ? `Your Jackpot Jungle verification code is: ${opts.code}\n\nThis code expires in 10 minutes.`
      : `Your Jackpot Jungle password reset code is: ${opts.code}\n\nThis code expires in 10 minutes.`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 12px; color: #111;">${isLogin ? "Verify your sign-in" : "Reset your password"}</h2>
        <div style="font-size: 32px; letter-spacing: 0.35em; font-weight: 800; text-align: center;
                    background: #f4f4f5; border-radius: 12px; padding: 16px 12px; margin: 20px 0; color: #111;">
          ${opts.code}
        </div>
        <p style="color: #888; font-size: 12px;">Expires in 10 minutes.</p>
      </div>
    `,
  });
}

/**
 * Login email OTP after password — fast path:
 * local 6-digit code + Hostinger HTTPS (no slow generateLink / GoTrue /otp).
 */
export const sendLoginEmailOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { email: string }) => d)
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }

    const user = await assertSessionOwnsEmail(context.userId, email);
    const code = makeSixDigitCode();
    const prev = user.user_metadata || {};

    // Store hash + send mail in parallel for speed.
    const [updateRes, sent] = await Promise.all([
      supabaseAdmin.auth.admin.updateUserById(context.userId, {
        user_metadata: {
          ...prev,
          jj_login_otp_hash: hashCode(email, code),
          jj_login_otp_exp: Date.now() + 10 * 60 * 1000,
        },
      }),
      sendCodeEmail({ email, code, kind: "login" }),
    ]);

    if (updateRes.error) {
      throw new Error(updateRes.error.message || "Could not store verification code.");
    }

    console.log(
      `[AuthOTP] Login OTP to ${email} via ${sent.via} in ${Date.now() - t0}ms`,
    );
    return { sent: true, via: sent.via, ms: Date.now() - t0 };
  });

/** Verify login email OTP (hashed in user_metadata). */
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

    if (!hash || exp < Date.now() || hash !== hashCode(email, code)) {
      throw new Error("Invalid or expired verification code.");
    }

    await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: { ...meta, jj_login_otp_hash: null, jj_login_otp_exp: null },
    });

    return { ok: true };
  });

/** Forgot-password OTP via Hostinger HTTPS + Auth recovery code. */
export const sendPasswordResetEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const t0 = Date.now();
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }

    try {
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (linkErr) {
        console.warn("[AuthOTP] recovery generateLink:", linkErr.message);
        return { sent: true, via: "none" };
      }

      const code = String(
        (linkData as any)?.properties?.email_otp || (linkData as any)?.email_otp || "",
      ).slice(0, 8);
      if (code.length < 6) {
        console.warn("[AuthOTP] recovery link missing email_otp");
        return { sent: true, via: "none" };
      }

      const sent = await sendCodeEmail({ email, code, kind: "recovery" });
      console.log(
        `[AuthOTP] Recovery OTP to ${email} via ${sent.via} in ${Date.now() - t0}ms`,
      );
      return { sent: true, via: sent.via, ms: Date.now() - t0 };
    } catch (e: any) {
      console.error("[AuthOTP] Recovery send failed:", e?.message || e);
      throw new Error(e?.message || "Could not send the verification email.");
    }
  });

/** After forgot-password reset: drop Authenticator 2FA. */
export const disableMfaAfterPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const removed = await disableAllMfaFactorsForUser(context.userId);
    console.log(`[MFA] Disabled ${removed} factor(s) after password reset for ${context.userId}`);
    return { ok: true, removed };
  });
