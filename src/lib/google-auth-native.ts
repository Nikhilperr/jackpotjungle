import { Capacitor } from "@capacitor/core";

const WEB_CLIENT_ID =
  "877420815591-feisfm6hjc1n8omdhrbv9li9tdk1v63t.apps.googleusercontent.com";

let ready: Promise<void> | null = null;

/** Initialize Capacitor GoogleAuth once (re-init on every login causes hangs / timeouts). */
export function ensureNativeGoogleAuth(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
      try {
        await GoogleAuth.initialize({
          clientId: WEB_CLIENT_ID,
          scopes: ["profile", "email"],
          grantOfflineAccess: true,
        });
      } catch (e) {
        // Already initialized is fine.
        console.log("[GoogleAuth] initialize:", e);
      }
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export async function nativeGoogleIdToken(): Promise<string> {
  await ensureNativeGoogleAuth();
  const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");

  // Do NOT race a short timeout against the account picker — users often need
  // >15s on first open, which caused "timeout → login twice" failures.
  const userResult = (await GoogleAuth.signIn()) as {
    authentication?: { idToken?: string };
  };
  const idToken = userResult?.authentication?.idToken;
  if (!idToken) throw new Error("Google Sign-In did not return an ID token.");
  return idToken;
}
