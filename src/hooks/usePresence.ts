import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks the current user's online presence:
 * - Marks online=true + last_seen=now on mount and every 30s
 * - Marks online=false on tab hide / page unload / sign-out
 * - Considers user offline after ~60s of no heartbeat (admin UIs can check last_seen)
 */
export function usePresence() {
  useEffect(() => {
    let userId: string | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    async function setOnline(online: boolean) {
      if (!userId) return;
      await supabase
        .from("profiles")
        .update({ online, last_seen: new Date().toISOString() })
        .eq("id", userId);
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") setOnline(true);
      else setOnline(false);
    }
    function handleUnload() {
      if (!userId) return;
      // best-effort beacon
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`;
      const body = JSON.stringify({ online: false, last_seen: new Date().toISOString() });
      try {
        navigator.sendBeacon?.(
          url,
          new Blob([body], { type: "application/json" }),
        );
      } catch {
        /* ignore */
      }
    }

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !mounted) return;
      userId = data.user.id;
      await setOnline(true);
      interval = setInterval(() => setOnline(true), 30_000);
      document.addEventListener("visibilitychange", handleVisibility);
      window.addEventListener("beforeunload", handleUnload);
      window.addEventListener("pagehide", handleUnload);
    })();

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      setOnline(false);
    };
  }, []);
}
