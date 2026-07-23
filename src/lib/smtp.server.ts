import * as fs from "fs";
import * as path from "path";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

function readEnvFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  // Prefer Auth/docker .env first — that is what the website mailer uses.
  const possiblePaths = [
    "/home/deploy/app/supabase/docker/.env",
    "/home/deploy/supabase/docker/.env",
    path.join(process.cwd(), "supabase", "docker", ".env"),
    path.join(process.cwd(), "..", "supabase", "docker", ".env"),
    path.join(process.cwd(), ".env"),
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
        const key = k.trim();
        const val = vParts.join("=").trim().replace(/(^["']|["']$)/g, "");
        if (key && out[key] === undefined) out[key] = val;
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

function pick(fileEnv: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    if (fileEnv[k]) return fileEnv[k];
    if (process.env[k]) return process.env[k]!;
  }
  return "";
}

/** Load SMTP — GOTRUE_SMTP_* from docker .env preferred (browser Auth mailer). */
export function loadSmtpConfig(): SmtpConfig {
  const fileEnv = readEnvFiles();
  const host = pick(fileEnv, "GOTRUE_SMTP_HOST", "SMTP_HOST") || "smtp.gmail.com";
  const port = parseInt(pick(fileEnv, "GOTRUE_SMTP_PORT", "SMTP_PORT") || "587", 10);
  const user = pick(
    fileEnv,
    "GOTRUE_SMTP_USER",
    "GOTRUE_SMTP_ADMIN_EMAIL",
    "SMTP_USER",
    "SMTP_ADMIN_EMAIL",
  );
  const pass = pick(fileEnv, "GOTRUE_SMTP_PASS", "GOTRUE_SMTP_PASSWORD", "SMTP_PASS");
  const from =
    pick(fileEnv, "GOTRUE_SMTP_ADMIN_EMAIL", "SMTP_FROM", "SMTP_SENDER") ||
    user ||
    "noreply@playjackpotjungle.com";

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
    throw new Error("SMTP is not configured (set GOTRUE_SMTP_USER / GOTRUE_SMTP_PASS on the VPS).");
  }

  // Docker-only hostnames are not reachable from the Nitro host process.
  let host = cfg.host;
  if (["smtp", "mail", "postfix", "inbucket", "mailhog"].includes(host.toLowerCase())) {
    host = "127.0.0.1";
  }

  const nodemailer = (await import("nodemailer")).default;
  const attempts = [
    { port: cfg.port, secure: cfg.port === 465 },
    { port: 465, secure: true },
    { port: 587, secure: false },
    { port: 2525, secure: false },
  ];
  // de-dupe ports
  const seen = new Set<number>();
  const list = attempts.filter((a) => (seen.has(a.port) ? false : (seen.add(a.port), true)));

  let lastErr: unknown;
  for (const a of list) {
    const transporter = nodemailer.createTransport({
      host,
      port: a.port,
      secure: a.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      family: 4,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
      tls: { rejectUnauthorized: false },
    });
    try {
      const info = await transporter.sendMail({
        from: `"${opts.fromName || "Jackpot Jungle"}" <${cfg.from}>`,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      console.log(`[SMTP] Sent via ${host}:${a.port} id=${info.messageId}`);
      return { messageId: String(info.messageId || "") };
    } catch (e) {
      lastErr = e;
      console.warn(`[SMTP] ${host}:${a.port} failed:`, (e as Error)?.message || e);
    } finally {
      transporter.close();
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("SMTP connection failed.");
}
