import { loadSmtpConfig, sendSmtpMail } from "@/lib/smtp.server";

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName?: string;
};

type HostingerMailbox = { resourceId?: string; resource_id?: string; address?: string };

/**
 * Hostinger Mail REST API (HTTPS :443) — NOT blocked by DigitalOcean.
 * Uses the same noreply@ mailbox; SMTP 465/587 from the droplet will never work on DO.
 *
 * Docs: POST https://api.mail.hostinger.com/api/v1/mailboxes/{id}/send
 * Token: hPanel → Emails → Agentic Mail → API → Create token
 */
async function sendViaHostingerMailApi(
  opts: MailPayload & { fromEmail: string; fromName: string },
): Promise<{ via: string } | null> {
  const token =
    process.env.HOSTINGER_MAIL_TOKEN?.trim() ||
    process.env.HOSTINGER_API_TOKEN?.trim() ||
    "";
  if (!token) return null;

  let mailboxId =
    process.env.HOSTINGER_MAILBOX_ID?.trim() ||
    process.env.HOSTINGER_MAILBOX_RESOURCE_ID?.trim() ||
    "";

  // Resolve mailbox resource id from /me when only the address is known.
  if (!mailboxId) {
    const meRes = await fetch("https://api.mail.hostinger.com/api/v1/me", {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!meRes.ok) {
      console.warn(`[Mail] Hostinger /me ${meRes.status}:`, (await meRes.text()).slice(0, 200));
      return null;
    }
    const me = (await meRes.json()) as any;
    const boxes: HostingerMailbox[] =
      me?.data?.mailboxes || me?.mailboxes || me?.data || [];
    const list = Array.isArray(boxes) ? boxes : [];
    const want = opts.fromEmail.toLowerCase();
    const hit =
      list.find((b) => (b.address || "").toLowerCase() === want) ||
      list.find((b) => (b.address || "").toLowerCase().includes("noreply")) ||
      list[0];
    mailboxId = hit?.resourceId || hit?.resource_id || "";
    if (!mailboxId) {
      console.warn("[Mail] Hostinger /me returned no mailbox resourceId", JSON.stringify(me).slice(0, 300));
      return null;
    }
    console.log(`[Mail] Hostinger mailbox ${hit?.address} → ${mailboxId}`);
  }

  const res = await fetch(
    `https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        displayName: opts.fromName,
      }),
      signal: AbortSignal.timeout(25000),
    },
  );

  if (res.ok || res.status === 204) {
    console.log(`[Mail] Sent via Hostinger Mail API mailbox=${mailboxId}`);
    return { via: "hostinger-api" };
  }

  console.warn(`[Mail] Hostinger send ${res.status}:`, (await res.text()).slice(0, 300));
  return null;
}

async function sendViaBrevoSmtp2525(opts: MailPayload & { fromEmail: string; fromName: string }) {
  const user =
    process.env.BREVO_SMTP_LOGIN?.trim() || process.env.BREVO_SMTP_USER?.trim() || "";
  const pass = process.env.BREVO_SMTP_KEY?.trim() || process.env.BREVO_SMTP_PASS?.trim() || "";
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
 * Delivery order (DigitalOcean-safe first):
 * 1) Hostinger Mail HTTPS API (same Hostinger mailbox, port 443)
 * 2) Brevo SMTP :2525 / Brevo+Resend HTTPS
 * 3) Direct Hostinger SMTP (usually blocked on DO)
 */
export async function sendTransactionalMail(opts: MailPayload): Promise<{ via: string }> {
  const cfg = loadSmtpConfig();
  const fromName = opts.fromName || cfg.fromName || "Jackpot Jungle";
  const fromEmail =
    process.env.MAIL_FROM?.trim() ||
    process.env.HOSTINGER_MAIL_FROM?.trim() ||
    cfg.from ||
    cfg.user ||
    "noreply@playjackpotjungle.com";

  // 1) Hostinger HTTPS — preferred: uses your real Hostinger mailbox, inbox deliverability
  try {
    const h = await sendViaHostingerMailApi({ ...opts, fromEmail, fromName });
    if (h) return h;
  } catch (e: any) {
    console.warn("[Mail] Hostinger API failed:", e?.message || e);
  }

  // 2) Brevo SMTP :2525
  try {
    const brevoSmtp = await sendViaBrevoSmtp2525({ ...opts, fromEmail, fromName });
    if (brevoSmtp) return brevoSmtp;
  } catch (e: any) {
    console.warn("[Mail] Brevo SMTP :2525 failed:", e?.message || e);
  }

  // 3) Webhook
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

  // 4) Brevo HTTPS
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

  // 5) Resend HTTPS
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

  // 6) Direct SMTP (Hostinger 465) — blocked on DO
  try {
    await sendSmtpMail(opts);
    return { via: "smtp" };
  } catch (e: any) {
    console.error("[Mail] All send paths failed:", e?.message || e);
    throw new Error(
      "Could not send email. DigitalOcean blocks SMTP 465/587. " +
        "Add HOSTINGER_MAIL_TOKEN to ~/app/.env (hPanel → Emails → Agentic Mail → API token). " +
        "Optional: HOSTINGER_MAILBOX_ID if auto-detect fails.",
    );
  }
}
