import * as fs from "fs";
import * as path from "path";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
  source: string;
};

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function readEnvFiles(): { vars: Record<string, string>; source: string } {
  // Browser Auth mailer uses supabase/docker/.env (SMTP_HOST=smtp.hostinger.com etc).
  const possiblePaths = [
    path.join(process.cwd(), "supabase", "docker", ".env"),
    "/home/deploy/app/supabase/docker/.env",
    "/home/deploy/supabase/docker/.env",
    path.join(process.cwd(), "..", "supabase", "docker", ".env"),
    path.join(process.cwd(), ".env"),
    "/home/deploy/app/.env",
    "/home/deploy/.env",
  ];

  const merged: Record<string, string> = {};
  let source = "process.env";

  for (const p of possiblePaths) {
    try {
      if (!fs.existsSync(p)) continue;
      const parsed = parseEnvFile(p);
      let hit = false;
      for (const [k, v] of Object.entries(parsed)) {
        if (merged[k] === undefined) {
          merged[k] = v;
          if (/^(GOTRUE_SMTP_|SMTP_)/.test(k)) hit = true;
        }
      }
      if (hit && source === "process.env") source = p;
    } catch {
      /* ignore */
    }
  }

  return { vars: merged, source };
}

function pick(fileEnv: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    const fromFile = fileEnv[k];
    if (fromFile) return fromFile;
    const fromProc = process.env[k];
    if (fromProc) return fromProc;
  }
  return "";
}

/**
 * Load SMTP from the same supabase/docker/.env Auth uses:
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_ADMIN_EMAIL / SMTP_SENDER_NAME
 */
export function loadSmtpConfig(): SmtpConfig {
  const { vars: fileEnv, source } = readEnvFiles();

  // Prefer plain SMTP_* (Hostinger / Supabase docker .env), then GOTRUE_SMTP_*.
  const host = pick(fileEnv, "SMTP_HOST", "GOTRUE_SMTP_HOST") || "smtp.hostinger.com";
  const port = parseInt(pick(fileEnv, "SMTP_PORT", "GOTRUE_SMTP_PORT") || "465", 10);
  const user = pick(
    fileEnv,
    "SMTP_USER",
    "GOTRUE_SMTP_USER",
    "SMTP_ADMIN_EMAIL",
    "GOTRUE_SMTP_ADMIN_EMAIL",
  );
  const pass = pick(fileEnv, "SMTP_PASS", "GOTRUE_SMTP_PASS", "GOTRUE_SMTP_PASSWORD");
  // From must be an email address — never SMTP_SENDER_NAME ("Jackpot Jungle").
  const from =
    pick(
      fileEnv,
      "SMTP_ADMIN_EMAIL",
      "GOTRUE_SMTP_ADMIN_EMAIL",
      "SMTP_FROM",
      "SMTP_SENDER",
    ) ||
    user ||
    "noreply@playjackpotjungle.com";
  const fromName =
    pick(fileEnv, "SMTP_SENDER_NAME", "GOTRUE_SMTP_SENDER_NAME") || "Jackpot Jungle";

  return { host, port, user, pass, from, fromName, source };
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
    throw new Error(
      "SMTP is not configured. Expected SMTP_HOST/USER/PASS in supabase/docker/.env (same file Auth uses).",
    );
  }

  let host = cfg.host;
  if (["smtp", "mail", "postfix", "inbucket", "mailhog"].includes(host.toLowerCase())) {
    host = "127.0.0.1";
  }

  console.log(
    `[SMTP] Using ${cfg.source} → ${host}:${cfg.port} user=${cfg.user} from=${cfg.from}`,
  );

  const nodemailer = (await import("nodemailer")).default;
  // Hostinger production mail: 465 SSL first, then 587 STARTTLS.
  const attempts = [
    { port: cfg.port, secure: cfg.port === 465 },
    { port: 465, secure: true },
    { port: 587, secure: false },
  ];
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
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      tls: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
      requireTLS: !a.secure && a.port === 587,
    });
    try {
      const info = await transporter.sendMail({
        from: `"${opts.fromName || cfg.fromName}" <${cfg.from}>`,
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
