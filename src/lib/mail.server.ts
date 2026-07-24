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

const ALLOW_BLOCK_HINT =
  "Hostinger Agentic Mail Allow/Block list is likely blocking delivery (API still returns 204). " +
  "In hPanel → Emails → Agentic Mail → Allow/Block lists for noreply@playjackpotjungle.com: " +
  "clear the Allow list (leave empty) and remove gmail.com from Block list.";

async function resolveMailboxId(
  token: string,
  fromEmail: string,
  fileEnv: Record<string, string>,
): Promise<string> {
  let mailboxId = envPick(fileEnv, "HOSTINGER_MAILBOX_ID", "HOSTINGER_MAILBOX_RESOURCE_ID");
  const KNOWN_NOREPLY_MAILBOX = "AC7f4db336147d8eb5cf09a00fee4f";

  if (!mailboxId) {
    try {
      const meRes = await fetch("https://api.mail.hostinger.com/api/v1/me", {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (meRes.ok) {
        const me = (await meRes.json()) as any;
        const boxes: HostingerMailbox[] =
          me?.data?.mailboxes || me?.mailboxes || me?.data || [];
        const list = Array.isArray(boxes) ? boxes : [];
        const want = fromEmail.toLowerCase();
        const hit =
          list.find((b) => (b.address || "").toLowerCase() === want) ||
          list.find((b) => (b.address || "").toLowerCase().includes("noreply")) ||
          list[0];
        mailboxId = hit?.resourceId || hit?.resource_id || "";
        if (mailboxId) {
          console.log(`[Mail] Hostinger mailbox ${hit?.address} → ${mailboxId}`);
        }
      }
    } catch (e: any) {
      console.warn("[Mail] Hostinger /me error:", e?.message || e);
    }
  }

  return mailboxId || KNOWN_NOREPLY_MAILBOX;
}

/** Best-effort: confirm the message landed in Sent (silent allow/block drops never appear).
 *  returns true | false | null (null = could not verify — don't treat as failure).
 */
async function confirmInSentFolder(
  token: string,
  mailboxId: string,
  subject: string,
): Promise<boolean | null> {
  try {
    const foldersRes = await fetch(
      `https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/folders`,
      {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!foldersRes.ok) {
      console.warn(`[Mail] Could not list folders (${foldersRes.status}) — skip Sent check`);
      return null;
    }
    const foldersJson = (await foldersRes.json()) as any;
    const folders: any[] =
      foldersJson?.data?.folders ||
      foldersJson?.data ||
      foldersJson?.folders ||
      (Array.isArray(foldersJson) ? foldersJson : []);

    const candidates = [
      ...folders
        .map((f) => String(f?.path || f?.name || f?.id || ""))
        .filter((p) => p.toLowerCase().includes("sent")),
      "INBOX.Sent",
      "Sent",
    ].filter(Boolean);

    const uniqueFolders = [...new Set(candidates)];
    let listedAny = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
      for (const folderPath of uniqueFolders) {
        const msgRes = await fetch(
          `https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/folders/${encodeURIComponent(folderPath)}/messages?limit=20`,
          {
            headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!msgRes.ok) continue;
        listedAny = true;
        const msgJson = (await msgRes.json()) as any;
        const messages: any[] =
          msgJson?.data?.messages ||
          msgJson?.data ||
          msgJson?.messages ||
          (Array.isArray(msgJson) ? msgJson : []);
        const hit = messages.some((m) => {
          const subj = String(m?.subject || m?.Subject || "");
          return subj.includes(subject) || (subj && subject.includes(subj));
        });
        if (hit) {
          console.log(`[Mail] Confirmed in Sent folder (${folderPath})`);
          return true;
        }
      }
    }

    if (!listedAny) {
      console.warn("[Mail] Sent folder listing unavailable — skip confirmation");
      return null;
    }
    console.warn(
      "[Mail] Subject not found in Sent — likely Agentic Mail Allow/Block silent drop",
    );
    return false;
  } catch (e: any) {
    console.warn("[Mail] Sent-folder check skipped:", e?.message || e);
    return null;
  }
}

/**
 * Resend HTTPS API — reliable fallback when Hostinger silently drops (allow/block lists).
 * Same from-address after domain verify in Resend dashboard.
 */
async function sendViaResend(
  opts: MailPayload & { fromEmail: string; fromName: string },
  fileEnv: Record<string, string>,
): Promise<{ via: string } | null> {
  const key = envPick(fileEnv, "RESEND_API_KEY");
  if (!key) return null;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${opts.fromName} <${opts.fromEmail}>`,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 240);
    throw new Error(`Resend failed (${res.status}): ${body}`);
  }
  console.log(`[Mail] Sent via Resend to ${opts.to}`);
  return { via: "resend" };
}

/**
 * Hostinger Mail REST API over HTTPS :443 — works on DigitalOcean.
 * Do NOT fall back to SMTP 465/587 (those hang for minutes = "Processing…" forever).
 *
 * IMPORTANT: Hostinger Allow/Block lists can silently drop mail while still returning 204.
 */
async function sendViaHostingerMailApi(
  opts: MailPayload & { fromEmail: string; fromName: string },
  fileEnv: Record<string, string>,
): Promise<{ via: string; confirmed: boolean | null }> {
  const token = envPick(fileEnv, "HOSTINGER_MAIL_TOKEN", "HOSTINGER_API_TOKEN");
  if (!token) {
    throw new Error(
      "HOSTINGER_MAIL_TOKEN is missing in ~/app/.env. Add the Agentic Mail API token, then: pm2 restart all --update-env",
    );
  }

  const mailboxId = await resolveMailboxId(token, opts.fromEmail, fileEnv);

  // Unique marker so we can confirm the exact message in Sent.
  const marker = `jj-${Date.now().toString(36)}`;
  const subject = opts.subject.includes("[jj-")
    ? opts.subject
    : `${opts.subject} [${marker}]`;

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
        subject,
        text: opts.text,
        html: opts.html,
        displayName: opts.fromName,
      }),
      signal: AbortSignal.timeout(20000),
    },
  );

  if (!(res.ok || res.status === 204)) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Hostinger send failed (${res.status}): ${body}`);
  }

  console.log(
    `[Mail] Hostinger API accepted send to ${opts.to} mailbox=${mailboxId} (HTTP ${res.status})`,
  );

  const confirmed = await confirmInSentFolder(token, mailboxId, marker);
  return { via: "hostinger-api", confirmed };
}

/**
 * Send OTP / transactional mail.
 * Prefer Hostinger; if Hostinger silently drops (allow/block), use Resend when configured.
 * Login + forgot-password both use this — UX flows unchanged.
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

  const preferResend =
    envPick(fileEnv, "MAIL_PROVIDER")?.toLowerCase() === "resend" ||
    envPick(fileEnv, "MAIL_PREFER_RESEND") === "1";

  console.log(`[Mail] Sending to ${opts.to} from ${fromEmail}`);

  if (preferResend) {
    const viaResend = await sendViaResend({ ...opts, fromEmail, fromName }, fileEnv);
    if (viaResend) return viaResend;
  }

  let hostingerErr: string | null = null;
  try {
    const result = await sendViaHostingerMailApi({ ...opts, fromEmail, fromName }, fileEnv);
    // null = could not verify Sent folder → accept Hostinger 204
    // true = confirmed in Sent
    // false = listed Sent but missing → silent allow/block drop
    if (result.confirmed !== false) {
      return { via: result.via };
    }
    console.warn(`[Mail] ${ALLOW_BLOCK_HINT}`);
    hostingerErr = ALLOW_BLOCK_HINT;
  } catch (e: any) {
    hostingerErr = e?.message || String(e);
    console.warn("[Mail] Hostinger path failed:", hostingerErr);
  }

  const viaResend = await sendViaResend({ ...opts, fromEmail, fromName }, fileEnv).catch(
    (e) => {
      console.warn("[Mail] Resend fallback failed:", e?.message || e);
      return null;
    },
  );
  if (viaResend) return viaResend;

  throw new Error(
    hostingerErr ||
      "Could not send email. Clear Hostinger Agentic Mail Allow list, or set RESEND_API_KEY in ~/app/.env.",
  );
}
