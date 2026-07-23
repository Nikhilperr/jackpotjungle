import { loadSmtpConfig, sendSmtpMail } from "@/lib/smtp.server";

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName?: string;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
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

/** Resend HTTP API — works when DigitalOcean blocks outbound SMTP (25/465/587). */
async function sendViaResend(opts: SendMailInput): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY || "";
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const fromEmail =
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    "Jackpot Jungle <onboarding@resend.dev>";

  const from = opts.fromName && !fromEmail.includes("<")
    ? `${opts.fromName} <${fromEmail}>`
    : fromEmail.includes("<")
      ? fromEmail
      : `${opts.fromName || "Jackpot Jungle"} <${fromEmail}>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(json?.message || `Resend failed (${res.status})`);
  }
  return { id: String(json?.id || "") };
}

/** Brevo (Sendinblue) HTTPS API — same idea as Resend. */
async function sendViaBrevo(opts: SendMailInput): Promise<{ id: string }> {
  const apiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || "";
  if (!apiKey) throw new Error("BREVO_API_KEY not set");

  const cfg = loadSmtpConfig();
  const senderEmail = process.env.BREVO_FROM || cfg.from || cfg.user;
  if (!senderEmail) throw new Error("BREVO_FROM not set");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: opts.fromName || "Jackpot Jungle", email: senderEmail },
      to: [{ email: opts.to }],
      subject: opts.subject,
      textContent: opts.text,
      htmlContent: opts.html,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Brevo failed (${res.status})`);
  }
  return { id: String(json?.messageId || "") };
}

/**
 * Send transactional email.
 * Prefer HTTPS providers (Resend/Brevo) — DO droplets often block SMTP.
 */
export async function sendTransactionalMail(opts: SendMailInput): Promise<{ via: string }> {
  const errors: string[] = [];

  if (process.env.RESEND_API_KEY) {
    try {
      await withTimeout(sendViaResend(opts), 12000, "Resend");
      return { via: "resend" };
    } catch (e: any) {
      errors.push(`resend: ${e?.message || e}`);
      console.warn("[Mail] Resend failed:", e?.message || e);
    }
  }

  if (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY) {
    try {
      await withTimeout(sendViaBrevo(opts), 12000, "Brevo");
      return { via: "brevo" };
    } catch (e: any) {
      errors.push(`brevo: ${e?.message || e}`);
      console.warn("[Mail] Brevo failed:", e?.message || e);
    }
  }

  // Last resort: SMTP (often blocked on DigitalOcean)
  try {
    await withTimeout(sendSmtpMail(opts), 10000, "SMTP");
    return { via: "smtp" };
  } catch (e: any) {
    errors.push(`smtp: ${e?.message || e}`);
  }

  throw new Error(
    "Email delivery is unavailable on the server (SMTP blocked / no HTTPS mail API). " +
      "Add RESEND_API_KEY to the VPS .env, then rebuild. " +
      `(${errors.slice(0, 2).join("; ")})`,
  );
}
