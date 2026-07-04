import { createServerFn } from "@tanstack/react-start";
import * as fs from "fs";
import * as path from "path";

export const notifyRecentLogin = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email?.trim();
    if (!email) throw new Error("Email is required");

    console.log(`[Email_Notification] Scanning configuration for SMTP credentials to notify: ${email}`);

    // Parse files for SMTP variables
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
      "/home/deploy/.env"
    ];

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, "utf8");
          const lines = content.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
            const [k, ...vParts] = trimmed.split("=");
            const val = vParts.join("=").trim().replace(/(^["']|["']$)/g, "");
            const keyUpper = k.trim().toUpperCase();
            
            if (keyUpper === "SMTP_HOST") smtpConfig.host = val;
            else if (keyUpper === "SMTP_PORT") smtpConfig.port = val;
            else if (keyUpper === "SMTP_USER" || keyUpper === "SMTP_ADMIN_EMAIL") smtpConfig.user = val;
            else if (keyUpper === "SMTP_PASS") smtpConfig.pass = val;
            else if (keyUpper === "SMTP_SENDER" || keyUpper === "SMTP_SENDER_NAME" || keyUpper === "SMTP_FROM") smtpConfig.from = val;
          }
        }
      } catch (e: any) {
        console.warn(`[Email_Notification] Error reading path ${p}:`, e.message);
      }
    }

    // Default fallbacks if not found
    const host = smtpConfig.host || process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(smtpConfig.port || process.env.SMTP_PORT || "587", 10);
    const user = smtpConfig.user || process.env.SMTP_USER || "";
    const pass = smtpConfig.pass || process.env.SMTP_PASS || "";
    const from = smtpConfig.from || process.env.SMTP_FROM || user || "security@playjackpotjungle.com";

    console.log(`[Email_Notification] Configured SMTP options: Host=${host}, Port=${port}, User=${user}, From=${from}`);

    if (!user || !pass) {
      console.warn("[Email_Notification] Missing SMTP credentials. Logging mock notification to console.");
      console.log(`
      ========================================
      SECURITY ALERT: RECENT LOGIN DETECTED
      To: ${email}
      Body:
      Hi there,
      
      We detected a recent login to your Jackpot Jungle account.
      If this was NOT you, please reset your password immediately:
      https://api.playjackpotjungle.com/app/forgot-password?email=${encodeURIComponent(email)}
      ========================================
      `);
      return { sent: false, mock: true };
    }

    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });

      const forgotPasswordLink = `https://api.playjackpotjungle.com/app/forgot-password?email=${encodeURIComponent(email)}`;

      const info = await transporter.sendMail({
        from: `"Jackpot Jungle Security" <${from}>`,
        to: email,
        subject: "⚠️ Security Alert: Recent Login Detected",
        text: `Hi there,\n\nWe detected a recent login to your Jackpot Jungle account.\n\nIf this was not you, please secure your account by resetting your password immediately using the link below:\n${forgotPasswordLink}\n\nBest regards,\nJackpot Jungle Team`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #d9534f; margin-top: 0;">⚠️ Recent Login Notification</h2>
            <p>Hi there,</p>
            <p>We detected a new, successful login to your Jackpot Jungle account.</p>
            <div style="background-color: #f7f7f7; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <p style="margin: 0; font-weight: bold; font-size: 14px;">Was this you?</p>
              <p style="margin: 5px 0 15px 0; font-size: 12px; color: #666;">If not, your account security may be compromised.</p>
              <a href="${forgotPasswordLink}" style="background-color: #d9534f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Reset My Password
              </a>
            </div>
            <p style="font-size: 12px; color: #999; margin-top: 30px;">
              If this was you, you can safely ignore this email.<br/>
              Jackpot Jungle Team
            </p>
          </div>
        `,
      });

      console.log("[Email_Notification] Security alert email sent successfully:", info.messageId);
      return { sent: true, messageId: info.messageId };
    } catch (err: any) {
      console.error("[Email_Notification] Failed to send email via SMTP transporter:", err.message);
      throw new Error("Failed to send security alert notification email: " + err.message);
    }
  });
