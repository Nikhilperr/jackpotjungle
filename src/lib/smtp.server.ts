import { execFile } from "node:child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
    if (fileEnv[k]) return fileEnv[k];
    if (process.env[k]) return process.env[k]!;
  }
  return "";
}

export function loadSmtpConfig(): SmtpConfig {
  const { vars: fileEnv, source } = readEnvFiles();
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

async function sendWithNodemailer(
  host: string,
  cfg: SmtpConfig,
  opts: { to: string; subject: string; text: string; html: string; fromName?: string },
): Promise<{ messageId: string }> {
  const nodemailer = (await import("nodemailer")).default;
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
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
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
      console.log(`[SMTP] Sent via host ${host}:${a.port} id=${info.messageId}`);
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

/** Find GoTrue/auth container — browser mailer runs here and can reach Hostinger. */
async function findAuthContainerId(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("docker", ["ps", "--format", "{{.ID}}\t{{.Names}}"], {
      timeout: 8000,
    });
    const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    const hit =
      lines.find((l) => /\bauth\b/i.test(l) && !/realtime|meta|rest/i.test(l)) ||
      lines.find((l) => /gotrue/i.test(l));
    if (!hit) return null;
    return hit.split("\t")[0] || hit.split(/\s+/)[0] || null;
  } catch (e: any) {
    console.warn("[SMTP] docker ps failed:", e?.message || e);
    return null;
  }
}

/**
 * Send SMTP using the Auth container's network namespace (swaks).
 * DO often blocks 465/587 from the host PM2 process while Auth still reaches Hostinger.
 */
async function sendSmtpViaAuthContainerNetwork(
  cfg: SmtpConfig,
  opts: { to: string; subject: string; text: string; html: string; fromName?: string },
): Promise<{ messageId: string }> {
  const containerId = await findAuthContainerId();
  if (!containerId) {
    throw new Error("Auth docker container not found for SMTP relay.");
  }

  const ports = [...new Set([cfg.port, 465, 587])];
  console.log(`[SMTP] Retry via Auth container network id=${containerId.slice(0, 12)}`);

  let lastErr = "Auth-network SMTP failed.";
  for (const port of ports) {
    const tlsFlags = port === 465 ? ["--tlsc"] : ["--tls"];
    try {
      const { stdout, stderr } = await execFileAsync(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          `container:${containerId}`,
          "instrumentisto/swaks",
          `--to=${opts.to}`,
          `--from=${cfg.from}`,
          `--server=${cfg.host}`,
          `--port=${port}`,
          ...tlsFlags,
          "--auth",
          "LOGIN",
          `--auth-user=${cfg.user}`,
          `--auth-password=${cfg.pass}`,
          `--header=Subject: ${opts.subject}`,
          `--body=${opts.text}`,
          "--timeout",
          "15",
        ],
        { timeout: 45000, maxBuffer: 1024 * 1024 },
      );
      const out = `${stdout}\n${stderr}`;
      if (/250 /i.test(out) || /=== Connected/i.test(out)) {
        console.log(`[SMTP] Sent via Auth-network swaks ${cfg.host}:${port}`);
        return { messageId: `swaks-${port}` };
      }
      lastErr = out.slice(0, 300);
    } catch (e: any) {
      lastErr = e?.stderr || e?.message || String(e);
      console.warn(`[SMTP] Auth-network swaks :${port} failed:`, String(lastErr).slice(0, 200));
    }
  }
  throw new Error(String(lastErr).slice(0, 300));
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

  try {
    return await sendWithNodemailer(host, cfg, opts);
  } catch (hostErr: any) {
    console.warn("[SMTP] Host send failed, trying Auth container network:", hostErr?.message || hostErr);
    try {
      const relayed = await sendSmtpViaAuthContainerNetwork(cfg, opts);
      console.log("[SMTP] Sent via Auth container network");
      return relayed;
    } catch (dockerErr: any) {
      console.error("[SMTP] Auth-network send failed:", dockerErr?.message || dockerErr);
      throw hostErr instanceof Error ? hostErr : new Error(String(hostErr));
    }
  }
}
