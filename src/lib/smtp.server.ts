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

/** Load SMTP settings — includes GoTrue docker names (GOTRUE_SMTP_*). */
export function loadSmtpConfig(): SmtpConfig {
  const fileEnv = readEnvFiles();
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const fromFile = fileEnv[k];
      if (fromFile) return fromFile;
      const fromProc = process.env[k];
      if (fromProc) return fromProc;
    }
    return "";
  };

  const host = pick("SMTP_HOST", "GOTRUE_SMTP_HOST") || "smtp.gmail.com";
  const port = parseInt(pick("SMTP_PORT", "GOTRUE_SMTP_PORT") || "587", 10);
  const user = pick("SMTP_USER", "SMTP_ADMIN_EMAIL", "GOTRUE_SMTP_USER", "GOTRUE_SMTP_ADMIN_EMAIL");
  const pass = pick("SMTP_PASS", "GOTRUE_SMTP_PASS", "GOTRUE_SMTP_PASSWORD");
  const from =
    pick("SMTP_FROM", "SMTP_SENDER", "SMTP_SENDER_NAME", "GOTRUE_SMTP_ADMIN_EMAIL", "GOTRUE_SMTP_SENDER_NAME") ||
    user ||
    "noreply@playjackpotjungle.com";

  return { host, port, user, pass, from };
}

async function sendOnce(
  cfg: SmtpConfig,
  opts: { to: string; subject: string; text: string; html: string; fromName?: string },
  port: number,
  secure: boolean,
): Promise<{ messageId: string }> {
  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port,
    secure,
    auth: { user: cfg.user, pass: cfg.pass },
    // DigitalOcean / many VPS hosts hang on IPv6 SMTP — force IPv4.
    family: 4,
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 10000,
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
    return { messageId: String(info.messageId || "") };
  } finally {
    transporter.close();
  }
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

  const attempts: Array<{ port: number; secure: boolean }> = [
    { port: cfg.port, secure: cfg.port === 465 },
  ];
  // Failover: if primary is 587, also try 465 (and vice versa).
  if (cfg.port !== 465) attempts.push({ port: 465, secure: true });
  if (cfg.port !== 587) attempts.push({ port: 587, secure: false });

  let lastErr: unknown;
  for (const a of attempts) {
    try {
      return await sendOnce(cfg, opts, a.port, a.secure);
    } catch (e) {
      lastErr = e;
      console.warn(`[SMTP] send failed host=${cfg.host} port=${a.port}:`, (e as Error)?.message || e);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to send email via SMTP.");
}
