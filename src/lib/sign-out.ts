import { Capacitor } from "@capacitor/core";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setVerifiedStatus } from "@/lib/auth-wait";

type NavigateFn = (opts: {
  to: "/app/auth";
  search: { logout: string };
  replace: boolean;
}) => void | Promise<void>;

function clearAuthBrowserStorage() {
  if (typeof window === "undefined") return;
  try {
    setVerifiedStatus(false);
    localStorage.removeItem("profile_complete");
    localStorage.removeItem("jj_temp_auth_verification");
    localStorage.removeItem("jj_google_session");
    localStorage.removeItem("jj_user_role");
    sessionStorage.removeItem("jj_auth_verifying");
    sessionStorage.removeItem("jj_auth_verify_state");
    sessionStorage.setItem("jj_signing_out", "1");

    const hostname = window.location.hostname.toLowerCase();
    const isProd = hostname.endsWith("playjackpotjungle.com");
    const domain = isProd ? "; domain=.playjackpotjungle.com" : "";

    // Clear Supabase auth keys from localStorage + cookies (custom storage adapter).
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("sb-") || k.includes("auth-token") || k.startsWith("supabase."))) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      localStorage.removeItem(k);
      document.cookie = `${k}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${domain}`;
      document.cookie = `${k}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure${domain}`;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Sign out and land on the in-app login screen.
 *
 * CRITICAL (Capacitor): never use window.location.* — a full document load to
 * /app/auth has no static file in the APK, so the WebView goes blank.
 */
export async function performSignOut(qc?: QueryClient, navigate?: NavigateFn) {
  clearAuthBrowserStorage();

  // Revoke session first on web so subdomain cookies can't resurrect it.
  try {
    if (Capacitor.isNativePlatform()) {
      await supabase.auth.signOut({ scope: "local" });
    } else {
      await supabase.auth.signOut({ scope: "global" });
    }
  } catch (e) {
    console.error("[SignOut] Supabase signOut failed:", e);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* ignore */
    }
  }

  if (qc) {
    try {
      await qc.cancelQueries();
      qc.clear();
    } catch {
      /* ignore */
    }
  }

  try {
    const sessionRes = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const uid = sessionRes?.data?.session?.user?.id;
    if (uid) {
      void supabase
        .from("profiles")
        .update({ online: false, last_seen: new Date().toISOString() })
        .eq("id", uid)
        .then(() => {})
        .catch(() => {});
    }
  } catch {
    /* ignore */
  }

  // Web production: hard navigate so every subdomain drops the session cookie UI.
  if (!Capacitor.isNativePlatform() && typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.endsWith("playjackpotjungle.com")) {
      window.location.href = "https://chat.playjackpotjungle.com/app/auth?logout=true";
      return;
    }
  }

  if (navigate) {
    try {
      await navigate({ to: "/app/auth", search: { logout: "true" }, replace: true });
      return;
    } catch (e) {
      console.error("[SignOut] navigate failed:", e);
    }
  }

  if (Capacitor.isNativePlatform() && typeof window !== "undefined") {
    try {
      const { getRouter } = await import("@/router");
      const router = getRouter();
      await router.navigate({ to: "/app/auth", search: { logout: "true" }, replace: true });
    } catch (e) {
      console.error("[SignOut] router fallback failed:", e);
    }
  }
}
