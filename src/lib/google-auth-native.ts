import { Capacitor } from "@capacitor/core";

const WEB_CLIENT_ID =
  "877420815591-feisfm6hjc1n8omdhrbv9li9tdk1v63t.apps.googleusercontent.com";

export const FORCE_GOOGLE_PICKER_KEY = "jj_force_google_account_picker";

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

/** Clear the native Google account so the next login shows the account picker. */
export async function nativeGoogleSignOut(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ensureNativeGoogleAuth();
    const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
    await GoogleAuth.signOut();
    console.log("[GoogleAuth] Native signOut complete");
  } catch (e) {
    console.warn("[GoogleAuth] Native signOut failed:", e);
  }
  try {
    sessionStorage.setItem(FORCE_GOOGLE_PICKER_KEY, "1");
  } catch {
    /* ignore */
  }
}

export async function nativeGoogleIdToken(): Promise<string> {
  await ensureNativeGoogleAuth();
  const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");

  // After logout, force the account chooser (don't silently reuse last Google user).
  let forcePicker = false;
  try {
    forcePicker = sessionStorage.getItem(FORCE_GOOGLE_PICKER_KEY) === "1";
  } catch {
    /* ignore */
  }
  if (forcePicker) {
    try {
      await GoogleAuth.signOut();
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.removeItem(FORCE_GOOGLE_PICKER_KEY);
    } catch {
      /* ignore */
    }
  }

  // Do NOT race a short timeout against the account picker — users often need
  // >15s on first open, which caused "timeout → login twice" failures.
  const userResult = (await GoogleAuth.signIn()) as {
    authentication?: { idToken?: string };
  };
  const idToken = userResult?.authentication?.idToken;
  if (!idToken) throw new Error("Google Sign-In did not return an ID token.");
  return idToken;
}
