import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt } from "node:crypto";
import { sendSmtpMail } from "@/lib/smtp.server";

type OtpEntry = { hash: string; exp: number };
const otpStore: Map<string, OtpEntry> =
  ((globalThis as any).__jjLoginOtpStore as Map<string, OtpEntry>) ||
  (((globalThis as any).__jjLoginOtpStore = new Map()), (globalThis as any).__jjLoginOtpStore);

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
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

/**
 * App-level login email OTP (after password session).
 * Fast path: no GoTrue /otp and no DB lookup — SMTP only, with hard timeout.
 */
export const sendLoginEmailOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }

    const code = String(randomInt(100000, 999999));
    otpStore.set(email, {
      hash: hashCode(email, code),
      exp: Date.now() + 10 * 60 * 1000,
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
      12000,
      "Sending email",
    );

    console.log(`[AuthOTP] Sent login OTP to ${email}`);
    return { sent: true };
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
    if (!entry || entry.exp < Date.now()) {
      otpStore.delete(email);
      throw new Error("Code expired. Tap Resend code for a new one.");
    }
    if (entry.hash !== hashCode(email, code)) {
      throw new Error("Invalid verification code.");
    }

    otpStore.delete(email);
    return { ok: true };
  });
