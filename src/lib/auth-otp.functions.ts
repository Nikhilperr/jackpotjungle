import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSmtpMail } from "@/lib/smtp.server";

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
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

/**
 * Login email OTP (second step after password).
 * Secure: requires Bearer session; email must match that user.
 * Delivery: VPS SMTP only (same .env / GOTRUE_SMTP_* as Auth) — no push / no other channels.
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

    try {
      await sendSmtpMail({
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
      });
    } catch (e: any) {
      console.error("[AuthOTP] SMTP send failed:", e?.message || e);
      throw new Error(
        "Could not send the verification email. Check GOTRUE_SMTP_* / SMTP_* in the VPS supabase/docker/.env (same settings the website Auth mailer uses), then restart Auth and the app.",
      );
    }

    console.log(`[AuthOTP] Email OTP sent to ${email} for user ${context.userId}`);
    return { sent: true, via: "email" };
  });

/**
 * Verify email OTP for the signed-in password session only.
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

    if (!hash || exp < Date.now() || hash !== hashCode(email, code)) {
      throw new Error("Invalid or expired verification code.");
    }

    await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: { ...meta, jj_login_otp_hash: null, jj_login_otp_exp: null },
    });

    return { ok: true };
  });

/** After forgot-password reset: drop Authenticator 2FA so the user can sign in and re-enroll. */
export const disableMfaAfterPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const removed = await disableAllMfaFactorsForUser(context.userId);
    console.log(`[MFA] Disabled ${removed} factor(s) after password reset for ${context.userId}`);
    return { ok: true, removed };
  });
