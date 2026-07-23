import * as fs from "fs";
import * as path from "path";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

/** Load SMTP settings from env and common self-host .env locations. */
export function loadSmtpConfig(): SmtpConfig {
  const smtpConfig: {
    host?: string;
    port?: string;
    user?: string;
    pass?: string;
    from?: string;
  } = {};

  const cwd = process.cwd();
  const possiblePaths = [
    path.join(cwd, ".env"),
    path.join(cwd, "supabase", "docker", ".env"),
    path.join(cwd, "..", "supabase", "docker", ".env"),
    path.join(cwd, "..", ".env"),
    path.join(cwd, "..", "app", "supabase", "docker", ".env"),
    "/home/deploy/app/supabase/docker/.env",
    "/home/deploy/supabase/docker/.env",
    "/home/deploy/app/.env",
    "/home/deploy/.env",
  ];

  for (const p of possiblePaths) {
    try {
      if (!fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const [k, ...vParts] = trimmed.split("=");
        const val = vParts.join("=").trim().replace(/(^["']|["']$)/g, "");
        const keyUpper = k.trim().toUpperCase();
        if (keyUpper === "SMTP_HOST") smtpConfig.host = val;
        else if (keyUpper === "SMTP_PORT") smtpConfig.port = val;
        else if (keyUpper === "SMTP_USER" || keyUpper === "SMTP_ADMIN_EMAIL") smtpConfig.user = val;
        else if (keyUpper === "SMTP_PASS") smtpConfig.pass = val;
        else if (
          keyUpper === "SMTP_SENDER" ||
          keyUpper === "SMTP_SENDER_NAME" ||
          keyUpper === "SMTP_FROM"
        ) {
          smtpConfig.from = val;
        }
      }
    } catch {
      /* ignore */
    }
  }

  const host = smtpConfig.host || process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(smtpConfig.port || process.env.SMTP_PORT || "587", 10);
  const user = smtpConfig.user || process.env.SMTP_USER || "";
  const pass = smtpConfig.pass || process.env.SMTP_PASS || "";
  const from = smtpConfig.from || process.env.SMTP_FROM || user || "noreply@playjackpotjungle.com";

  return { host, port, user, pass, from };
}

export async function sendSmtpMail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName?: string;
}): Promise<{ messageId: string }> {
  const cfg = loadSmtpConfig();
  if (!cfg.user || !cfg.pass) {
    throw new Error("SMTP is not configured on the server (missing SMTP_USER / SMTP_PASS).");
  }

  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const info = await transporter.sendMail({
    from: `"${opts.fromName || "Jackpot Jungle"}" <${cfg.from}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  return { messageId: String(info.messageId || "") };
}
