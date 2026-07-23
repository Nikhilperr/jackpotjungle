import { loadSmtpConfig, sendSmtpMail } from "@/lib/smtp.server";

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName?: string;
};

/** Brevo SMTP relay on port 2525 — usually open on DigitalOcean (465/587 are blocked). */
async function sendViaBrevoSmtp2525(opts: MailPayload & { fromEmail: string; fromName: string }) {
  const user =
    process.env.BREVO_SMTP_LOGIN?.trim() ||
    process.env.BREVO_SMTP_USER?.trim() ||
    "";
  const pass =
    process.env.BREVO_SMTP_KEY?.trim() ||
    process.env.BREVO_SMTP_PASS?.trim() ||
    "";
  if (!user || !pass) return null;

  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 2525,
    secure: false,
    auth: { user, pass },
    family: 4,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
    tls: { rejectUnauthorized: false },
  });
  try {
    const info = await transporter.sendMail({
      from: `"${opts.fromName}" <${opts.fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    console.log(`[Mail] Sent via Brevo SMTP :2525 id=${info.messageId}`);
    return { via: "brevo-smtp-2525" };
  } finally {
    transporter.close();
  }
}

/**
 * Send mail in an order that works on DigitalOcean:
 * 1) Brevo SMTP port 2525 (not blocked like Hostinger 465/587)
 * 2) HTTPS APIs (Brevo / Resend / webhook) on port 443
 * 3) Hostinger SMTP last (usually times out on DO)
 */
export async function sendTransactionalMail(opts: MailPayload): Promise<{ via: string }> {
  const cfg = loadSmtpConfig();
  const fromName = opts.fromName || cfg.fromName || "Jackpot Jungle";
  const fromEmail =
    process.env.MAIL_FROM?.trim() ||
    cfg.from ||
    cfg.user ||
    "noreply@playjackpotjungle.com";

  // 1) Brevo SMTP :2525 — proven path when DO blocks 465/587
  try {
    const brevoSmtp = await sendViaBrevoSmtp2525({ ...opts, fromEmail, fromName });
    if (brevoSmtp) return brevoSmtp;
  } catch (e: any) {
    console.warn("[Mail] Brevo SMTP :2525 failed:", e?.message || e);
  }

  // 2) Custom HTTPS relay
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

  // 3) Brevo HTTPS API
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

  // 4) Resend HTTPS API
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

  // 5) Hostinger / docker SMTP (usually blocked on DO)
  try {
    await sendSmtpMail(opts);
    return { via: "smtp" };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[Mail] All send paths failed. Last SMTP error:", msg);
    throw new Error(
      "Email blocked on this VPS. Add Brevo (port 2525) to ~/app/.env: " +
        "BREVO_SMTP_LOGIN=... BREVO_SMTP_KEY=... (from Brevo → SMTP & API). " +
        "Also verify domain playjackpotjungle.com in Brevo so mail is not spam.",
    );
  }
}
