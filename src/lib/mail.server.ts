import { loadSmtpConfig, sendSmtpMail } from "@/lib/smtp.server";

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName?: string;
};

/**
 * Send mail in an order that works on DigitalOcean:
 * 1) HTTPS APIs / webhook (port 443 — not blocked)
 * 2) Short SMTP attempt (usually blocked on DO → timeout)
 *
 * Hostinger SMTP from this droplet times out; GoTrue /otp also 504s for the same reason.
 */
export async function sendTransactionalMail(opts: MailPayload): Promise<{ via: string }> {
  const cfg = loadSmtpConfig();
  const fromName = opts.fromName || cfg.fromName || "Jackpot Jungle";
  const fromEmail = cfg.from || cfg.user || "noreply@playjackpotjungle.com";

  // 1) Custom HTTPS relay (e.g. PHP on Hostinger web hosting that can SMTP locally)
  const webhook = process.env.MAIL_WEBHOOK_URL?.trim();
  const webhookSecret = process.env.MAIL_WEBHOOK_SECRET?.trim();
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "X-Mail-Relay-Secret": webhookSecret } : {}),
        },
        body: JSON.stringify({
          to: opts.to,
          subject: opts.subject,
          text: opts.text,
          html: opts.html,
          from: fromEmail,
          fromName,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        console.log(`[Mail] Sent via MAIL_WEBHOOK_URL`);
        return { via: "webhook" };
      }
      console.warn(`[Mail] webhook ${res.status}:`, (await res.text()).slice(0, 200));
    } catch (e: any) {
      console.warn("[Mail] webhook failed:", e?.message || e);
    }
  }

  // 2) Brevo HTTPS API (free tier) — https://app.brevo.com
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  if (brevoKey) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": brevoKey,
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: opts.to }],
          subject: opts.subject,
          htmlContent: opts.html,
          textContent: opts.text,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        console.log(`[Mail] Sent via Brevo HTTPS`);
        return { via: "brevo" };
      }
      console.warn(`[Mail] Brevo ${res.status}:`, (await res.text()).slice(0, 200));
    } catch (e: any) {
      console.warn("[Mail] Brevo failed:", e?.message || e);
    }
  }

  // 3) Resend HTTPS API
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        console.log(`[Mail] Sent via Resend HTTPS`);
        return { via: "resend" };
      }
      console.warn(`[Mail] Resend ${res.status}:`, (await res.text()).slice(0, 200));
    } catch (e: any) {
      console.warn("[Mail] Resend failed:", e?.message || e);
    }
  }

  // 4) Last resort: direct SMTP (blocked on most DO droplets)
  try {
    await sendSmtpMail(opts);
    return { via: "smtp" };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[Mail] All send paths failed. Last SMTP error:", msg);
    throw new Error(
      "Email send blocked on this VPS (SMTP ports timeout). " +
        "Add BREVO_API_KEY or RESEND_API_KEY or MAIL_WEBHOOK_URL to ~/app/.env, " +
        "or ask DigitalOcean to unlock SMTP ports 465/587.",
    );
  }
}
