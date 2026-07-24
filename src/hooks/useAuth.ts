import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  getSharedInitialSession,
  peekLastKnownSession,
  setSharedSessionCache,
} from "@/lib/auth-wait";

export function useAuth() {
  const peek = typeof window !== "undefined" ? peekLastKnownSession() : undefined;
  const [session, setSession] = useState<Session | null>(() => peek ?? null);
  const [user, setUser] = useState<User | null>(() => peek?.user ?? null);
  // undefined peek = cold; known session = skip blank loading flash on remount.
  const [loading, setLoading] = useState(() => peek === undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      setSharedSessionCache(s);
      if (s?.user?.id && typeof window !== "undefined") {
        try {
          localStorage.setItem("jj_me_id", s.user.id);
        } catch {
          /* ignore */
        }
      }
    });
    getSharedInitialSession().then((s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      setSharedSessionCache(s);
      if (s?.user?.id && typeof window !== "undefined") {
        try {
          localStorage.setItem("jj_me_id", s.user.id);
        } catch {
          /* ignore */
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}
