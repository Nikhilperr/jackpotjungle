import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export async function waitInitialSession(timeoutMs = 4000): Promise<Session | null> {
  if (typeof window !== "undefined") {
    const hash = window.location.hash;
    if (hash.includes("access_token=") && hash.includes("refresh_token=")) {
      const cleanHash = hash.startsWith("#") ? hash.substring(1) : hash;
      const params = new URLSearchParams(cleanHash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        try {
          const { data } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          if (data.session) return data.session;
        } catch (e) {
          console.error("Failed to set session from URL hash:", e);
        }
      }
    }
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    return session;
  }

  // Detect if a saved session token exists in local storage, cookies, or if we are processing a redirect
  let hasTokenInStorage = false;
  try {
    hasTokenInStorage = typeof window !== "undefined" && (
      Object.keys(localStorage).some(key => key.startsWith("sb-") && key.endsWith("-auth-token")) ||
      document.cookie.split(";").some(c => c.trim().startsWith("sb-") && c.includes("-auth-token")) ||
      window.location.hash.includes("access_token=") ||
      window.location.search.includes("code=") ||
      window.location.hash.includes("id_token=")
    );
  } catch (e) {
    console.warn("Storage/cookie access failed in waitInitialSession:", e);
  }

  return new Promise((resolve) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        sub.subscription.unsubscribe();
        resolve(null);
      }
    }, timeoutMs);

    const { data: sub } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (currentSession) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          sub.subscription.unsubscribe();
          resolve(currentSession);
        }
      } else if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
        // If local storage has a token, do not resolve null prematurely on INITIAL_SESSION.
        // Wait for Supabase to resolve the session or fallback to the timeout.
        if (event === "INITIAL_SESSION" && hasTokenInStorage) {
          return;
        }

        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          sub.subscription.unsubscribe();
          resolve(null);
        }
      }
    });
  });
}
