import { Capacitor } from "@capacitor/core";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setVerifiedStatus } from "@/lib/auth-wait";

type NavigateFn = (opts: {
  to: "/app/auth";
  search: { logout: string };
  replace: boolean;
}) => void | Promise<void>;

/**
 * Sign out and land on the in-app login screen.
 *
 * CRITICAL (Capacitor): never use window.location.* — a full document load to
 * /app/auth has no static file in the APK, so the WebView goes blank and looks
 * like the app closed. Always use the TanStack router navigate() instead.
 *
 * Also skip GoogleAuth.signOut() — app session is Supabase-only; the Google
 * plugin call can hang the native bridge on MIUI.
 */
export async function performSignOut(qc?: QueryClient, navigate?: NavigateFn) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("jj_signing_out", "1");
    localStorage.removeItem("profile_complete");
    localStorage.removeItem("jj_temp_auth_verification");
    localStorage.removeItem("jj_google_session");
    setVerifiedStatus(false);
  }

  // 1) Route to login FIRST (logout flag stops auth from bouncing back).
  if (navigate) {
    try {
      await navigate({ to: "/app/auth", search: { logout: "true" }, replace: true });
    } catch (e) {
      console.error("[SignOut] navigate failed:", e);
    }
  } else if (!Capacitor.isNativePlatform()) {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.endsWith("playjackpotjungle.com")) {
      window.location.href = "https://chat.playjackpotjungle.com/app/auth?logout=true";
      return;
    }
  }

  // 2) Best-effort presence + cache clear (never block login handoff).
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

  if (qc) {
    try {
      await qc.cancelQueries();
      qc.clear();
    } catch {
      /* ignore */
    }
  }

  // 3) Clear Supabase session locally only.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (e) {
    console.error("[SignOut] Supabase signOut failed:", e);
  }

  // Fallback if navigate wasn't provided on native (should be rare).
  if (Capacitor.isNativePlatform() && navigate == null && typeof window !== "undefined") {
    try {
      const { getRouter } = await import("@/router");
      const router = getRouter();
      await router.navigate({ to: "/app/auth", search: { logout: "true" }, replace: true });
    } catch (e) {
      console.error("[SignOut] router fallback failed:", e);
    }
  }
}
