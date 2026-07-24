import * as fs from "fs";
import * as path from "path";

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName?: string;
};

type HostingerMailbox = { resourceId?: string; resource_id?: string; address?: string };

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!fs.existsSync(filePath)) return out;
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
      if (key && out[key] === undefined) out[key] = val;
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** Prefer app .env (where HOSTINGER_MAIL_TOKEN lives) over docker SMTP .env. */
function loadAppEnv(): Record<string, string> {
  const paths = [
    path.join(process.cwd(), ".env"),
    "/home/deploy/app/.env",
    "/home/deploy/.env",
    path.join(process.cwd(), "supabase", "docker", ".env"),
    "/home/deploy/app/supabase/docker/.env",
    "/home/deploy/supabase/docker/.env",
  ];
  const merged: Record<string, string> = {};
  for (const p of paths) {
    const parsed = parseEnvFile(p);
    for (const [k, v] of Object.entries(parsed)) {
      if (merged[k] === undefined) merged[k] = v;
    }
  }
  return merged;
}

function envPick(fileEnv: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    const a = process.env[k]?.trim();
    if (a) return a;
    const b = fileEnv[k]?.trim();
    if (b) return b;
  }
  return "";
}

/**
 * Hostinger Mail REST API over HTTPS :443 — works on DigitalOcean.
 * Do NOT fall back to SMTP 465/587 (those hang for minutes = "Processing…" forever).
 */
async function sendViaHostingerMailApi(
  opts: MailPayload & { fromEmail: string; fromName: string },
  fileEnv: Record<string, string>,
): Promise<{ via: string }> {
  const token = envPick(fileEnv, "HOSTINGER_MAIL_TOKEN", "HOSTINGER_API_TOKEN");
  if (!token) {
    throw new Error(
      "HOSTINGER_MAIL_TOKEN is missing in ~/app/.env. Add the Agentic Mail API token, then: pm2 restart all --update-env",
    );
  }

  let mailboxId = envPick(
    fileEnv,
    "HOSTINGER_MAILBOX_ID",
    "HOSTINGER_MAILBOX_RESOURCE_ID",
  );

  if (!mailboxId) {
    const meRes = await fetch("https://api.mail.hostinger.com/api/v1/me", {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!meRes.ok) {
      throw new Error(`Hostinger /me failed (${meRes.status}): ${(await meRes.text()).slice(0, 180)}`);
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
      throw new Error("Hostinger API returned no mailbox. Set HOSTINGER_MAILBOX_ID in ~/app/.env");
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
      signal: AbortSignal.timeout(20000),
    },
  );

  if (res.ok || res.status === 204) {
    console.log(`[Mail] Sent via Hostinger Mail API to ${opts.to} mailbox=${mailboxId}`);
    return { via: "hostinger-api" };
  }

  const body = (await res.text()).slice(0, 300);
  throw new Error(`Hostinger send failed (${res.status}): ${body}`);
}

/**
 * Send OTP / transactional mail. Hostinger HTTPS only (no SMTP hang on DO).
 */
export async function sendTransactionalMail(opts: MailPayload): Promise<{ via: string }> {
  const fileEnv = loadAppEnv();
  const fromName =
    opts.fromName ||
    envPick(fileEnv, "SMTP_SENDER_NAME") ||
    "Jackpot Jungle";
  const fromEmail =
    envPick(fileEnv, "MAIL_FROM", "HOSTINGER_MAIL_FROM", "SMTP_ADMIN_EMAIL", "SMTP_USER") ||
    "noreply@playjackpotjungle.com";

  console.log(`[Mail] Sending to ${opts.to} from ${fromEmail} (Hostinger HTTPS)`);
  return sendViaHostingerMailApi({ ...opts, fromEmail, fromName }, fileEnv);
}
