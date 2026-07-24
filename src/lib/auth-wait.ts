import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

// ─── Shared startup session cache ────────────────────────────────────────────
// On cold boot multiple callers (useAuth, useRole, route guards) previously
// each called supabase.auth.getSession() in parallel, causing 4-5 redundant
// WebView storage reads and JWT validation round-trips. This shared Promise
// resolves exactly once and is reused by every caller.
let _sharedSessionPromise: Promise<Session | null> | null = null;

export function getSharedInitialSession(): Promise<Session | null> {
  // OAuth / magic-link returns with tokens in the hash. Never cache a premature
  // null from getSession() racing ahead of Supabase parsing that hash — that
  // forced a second login attempt on web Google auth.
  if (typeof window !== "undefined") {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    if (
      (hash.includes("access_token=") && hash.includes("refresh_token=")) ||
      search.includes("code=")
    ) {
      _sharedSessionPromise = null;
    }
  }

  if (!_sharedSessionPromise) {
    _sharedSessionPromise = (async () => {
      if (typeof window !== "undefined") {
        const hash = window.location.hash || "";
        if (hash.includes("access_token=") && hash.includes("refresh_token=")) {
          const cleanHash = hash.startsWith("#") ? hash.substring(1) : hash;
          const params = new URLSearchParams(cleanHash);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            try {
              const { data } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              window.history.replaceState(
                null,
                "",
                window.location.pathname + window.location.search,
              );
              if (data.session) return data.session;
            } catch (e) {
              console.error("Failed to set session from URL hash:", e);
            }
          }
        }
      }
      try {
        const { data } = await supabase.auth.getSession();
        return data.session ?? null;
      } catch {
        return null;
      }
    })();
  }
  return _sharedSessionPromise;
}

/** Call on SIGNED_OUT so the next login triggers a fresh lookup. */
export function clearSharedSessionCache() {
  _sharedSessionPromise = null;
}

/** Keep route guards warm with the latest session from auth events. */
export function setSharedSessionCache(session: Session | null) {
  _sharedSessionPromise = Promise.resolve(session);
}

// Keep the shared cache in sync with auth events.
// Clearing on TOKEN_REFRESHED forced every beforeLoad to re-fetch getSession(),
// which flashed the full-screen pending spinner (loading ↔ chats loop).
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || event === "USER_DELETED") {
      clearSharedSessionCache();
      return;
    }
    if (
      event === "TOKEN_REFRESHED" ||
      event === "SIGNED_IN" ||
      event === "USER_UPDATED" ||
      event === "INITIAL_SESSION"
    ) {
      if (session) setSharedSessionCache(session);
    }
  });
}

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

  let hasTokenInStorage = false;
  try {
    hasTokenInStorage = typeof window !== "undefined" && (
      Object.keys(localStorage).some(key => key.startsWith("sb-") && key.endsWith("-auth-token")) ||
      document.cookie.split(";").some(c => c.trim().startsWith("sb-") && c.includes("-auth-token")) ||
      window.location.hash.includes("access_token=") ||
      window.location.search.includes("code=") ||
      window.location.hash.includes("id_token=") ||
      getVerifiedStatus()
    );
  } catch (e) {
    console.warn("Storage/cookie access failed in waitInitialSession:", e);
  }

  if (!hasTokenInStorage) {
    return null;
  }

  const session = await getSharedInitialSession();
  if (session) {
    return session;
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

export function getVerifiedStatus(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const localVal = localStorage.getItem("jj_verified") === "true";
  const cookieVal = document.cookie.split(";").some(c => c.trim() === "jj_verified=true");
  return localVal || cookieVal;
}

export function setVerifiedStatus(val: boolean) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const hostname = window.location.hostname.toLowerCase();
  const domain = hostname.endsWith("playjackpotjungle.com") ? "; domain=.playjackpotjungle.com" : "";
  if (val) {
    localStorage.setItem("jj_verified", "true");
    document.cookie = `jj_verified=true; path=/${domain}; max-age=86400; SameSite=Lax; Secure`;
  } else {
    localStorage.removeItem("jj_verified");
    document.cookie = `jj_verified=; path=/${domain}; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure`;
  }
}
