import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export async function waitInitialSession(timeoutMs = 4000): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
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
