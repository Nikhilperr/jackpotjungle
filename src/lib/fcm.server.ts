import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

let serviceAccount: any = null;
let initialized = false;

function loadServiceAccount() {
  if (initialized) return serviceAccount;
  initialized = true;

  try {
    // 1. Check environment variable
    const envVal = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envVal) {
      if (envVal.trim().startsWith("{")) {
        serviceAccount = JSON.parse(envVal);
        console.log("[FCM] Loaded Firebase service account from environment variable (JSON string).");
        return serviceAccount;
      } else {
        const resolvedPath = path.resolve(envVal);
        if (fs.existsSync(resolvedPath)) {
          serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
          console.log(`[FCM] Loaded Firebase service account from environment variable path: ${resolvedPath}`);
          return serviceAccount;
        }
      }
    }

    // 2. Check local file in root directory
    const rootPath = path.join(process.cwd(), "firebase-service-account.json");
    if (fs.existsSync(rootPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(rootPath, "utf8"));
      console.log("[FCM] Loaded Firebase service account from local firebase-service-account.json.");
      return serviceAccount;
    }
  } catch (err) {
    console.error("[FCM] Error loading Firebase service account credentials:", err);
  }

  console.warn(
    "[FCM] Firebase service account not configured. Background push notifications will be disabled.\n" +
    "To enable background push notifications, download your service account JSON file from Firebase Console " +
    "and save it as 'firebase-service-account.json' in the project root, or set the FIREBASE_SERVICE_ACCOUNT environment variable."
  );
  return null;
}

function base64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlFromBuffer(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload: any, privateKey: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(input);
  const signatureBuffer = sign.sign(privateKey);
  const encodedSignature = base64urlFromBuffer(signatureBuffer);

  return `${input}.${encodedSignature}`;
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry - 60) {
    return cachedToken;
  }

  const normalizedPrivateKey = sa.private_key.replace(/\\n/g, "\n");

  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const jwt = signJwt(payload, normalizedPrivateKey);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain Google access token: ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiry = now + data.expires_in;
  return cachedToken;
}

export type PushOptions = {
  /** Absolute HTTPS image URL (avatar / logo / photo) for BigPicture-style notifications. */
  imageUrl?: string | null;
};

export async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  options?: PushOptions,
): Promise<void> {
  const sa = loadServiceAccount();
  if (!sa) {
    console.log("[FCM] Skip sending push (FCM is not configured).");
    return;
  }

  if (tokens.length === 0) return;

  const imageUrl =
    options?.imageUrl && /^https?:\/\//i.test(options.imageUrl) ? options.imageUrl : undefined;

  console.log(`[FCM] Preparing to send push to ${tokens.length} tokens. Title: "${title}"${imageUrl ? " (with image)" : ""}`);

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (err) {
    console.error("[FCM] Error obtaining access token:", err);
    return;
  }

  const projectId = sa.project_id;
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const promises = tokens.map(async (token) => {
    try {
      const isCall = data?.type === "call";
      
      const payload: any = {
        message: {
          token,
          data: data ? { ...data } : {},
          android: {
            priority: "high",
          },
        },
      };

      // Always populate title and body inside the data block for custom receiver access
      payload.message.data.title = title;
      payload.message.data.body = body;
      if (imageUrl) payload.message.data.image = imageUrl;

      if (!isCall) {
        // Standard notification payload for chats, etc.
        payload.message.notification = {
          title,
          body,
          ...(imageUrl ? { image: imageUrl } : {}),
        };
        payload.message.android.notification = {
          sound: "default",
          default_sound: true,
          default_vibrate_timings: true,
          notification_priority: "PRIORITY_HIGH",
          click_action: "FCM_PLUGIN_ACTIVITY",
          // chat_messages_v2 is created in MainActivity with the phone's default notification sound.
          channel_id: data?.type === "call" ? "calls_ringtone_v3" : "chat_messages_v2",
          ...(imageUrl ? { image: imageUrl } : {}),
        };
        payload.message.apns = {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              mutableContent: true,
            },
          },
          ...(imageUrl
            ? {
                fcm_options: {
                  image: imageUrl,
                },
              }
            : {}),
        };
      } else {
        // Call payload: data-only for Android to wake up background service.
        // For APNS, use content-available to trigger background processing.
        payload.message.apns = {
          headers: {
            "apns-priority": "10",
          },
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              "content-available": 1,
            },
          },
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[FCM] Failed to send push to token ${token.substring(0, 10)}...:`, errText);
        
        // Auto-cleanup stale token if unregistered
        if (errText.includes("UNREGISTERED") || errText.includes("INVALID_ARGUMENT")) {
          console.log(`[FCM] Removing invalid token from database: ${token.substring(0, 10)}...`);
          // We can't import supabaseAdmin directly here to prevent circular imports if any,
          // but we can import it on-demand.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("push_tokens").delete().eq("token", token);
        }
      } else {
        console.log(`[FCM] Successfully delivered push to token: ${token.substring(0, 10)}...`);
      }
    } catch (err) {
      console.error(`[FCM] Exception sending push to token ${token.substring(0, 10)}...:`, err);
    }
  });

  await Promise.all(promises);
}
