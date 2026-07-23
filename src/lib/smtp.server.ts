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
    // Prefer GoTrue/docker env (what the browser Auth mailer uses)
    "/home/deploy/app/supabase/docker/.env",
    "/home/deploy/supabase/docker/.env",
    path.join(cwd, "supabase", "docker", ".env"),
    path.join(cwd, "..", "supabase", "docker", ".env"),
    path.join(cwd, ".env"),
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
        // First file wins for each key (docker paths listed first).
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

/** Prefer GOTRUE_SMTP_* (Docker Auth) over app SMTP_*. */
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
    pick(fileEnv, "GOTRUE_SMTP_ADMIN_EMAIL", "SMTP_FROM", "SMTP_SENDER", "GOTRUE_SMTP_SENDER_NAME") ||
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
    throw new Error("SMTP is not configured on the server (missing SMTP_USER / SMTP_PASS).");
  }

  // Docker service hostnames only resolve inside compose — rewrite common ones for the host.
  let host = cfg.host;
  if (host === "smtp" || host === "mail" || host === "postfix" || host === "inbucket") {
    host = "127.0.0.1";
  }

  const nodemailer = (await import("nodemailer")).default;
  const ports = [...new Set([cfg.port, 465, 587, 2525])];
  let lastErr: unknown;

  for (const port of ports) {
    const secure = port === 465;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: cfg.user, pass: cfg.pass },
      family: 4,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
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
    } catch (e) {
      lastErr = e;
      console.warn(`[SMTP] ${host}:${port} failed:`, (e as Error)?.message || e);
    } finally {
      transporter.close();
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("SMTP connection failed.");
}
