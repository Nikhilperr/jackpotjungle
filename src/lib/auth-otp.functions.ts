import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSmtpMail } from "@/lib/smtp.server";

/**
 * Login email OTP via VPS Auth + VPS SMTP (.env / GOTRUE_SMTP_*).
 * Does NOT use GoTrue /auth/v1/otp (returns 504 on this host).
 * generateLink is fast (~1s) and returns email_otp; we email it with the same SMTP the VPS already uses.
 */
export const sendLoginEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkErr) {
      console.error("[AuthOTP] generateLink failed:", linkErr);
      throw new Error(linkErr.message || "Could not generate verification code.");
    }

    const emailOtp =
      (linkData as any)?.properties?.email_otp ||
      (linkData as any)?.email_otp ||
      "";

    if (!emailOtp || String(emailOtp).length < 6) {
      console.error("[AuthOTP] generateLink returned no email_otp:", linkData);
      throw new Error("Auth did not return an email code. Check GoTrue settings on the VPS.");
    }

    const code = String(emailOtp).slice(0, 8);

    await sendSmtpMail({
      to: email,
      fromName: "Jackpot Jungle",
      subject: `${code} is your Jackpot Jungle verification code`,
      text:
        `Your Jackpot Jungle verification code is: ${code}\n\n` +
        `This code expires in a few minutes. If you did not try to sign in, you can ignore this email.`,
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
          <p style="color: #888; font-size: 12px;">
            This code expires shortly. If you did not request it, you can ignore this email.
          </p>
        </div>
      `,
    });

    console.log(`[AuthOTP] Sent login OTP to ${email}`);
    return { sent: true };
  });
