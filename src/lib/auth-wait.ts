import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export async function waitInitialSession(timeoutMs = 4000): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    return session;
  }

  // Detect if a saved session token exists in local storage
  const hasTokenInStorage = typeof window !== "undefined" && 
    Object.keys(localStorage).some(key => key.startsWith("sb-") && key.endsWith("-auth-token"));

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
