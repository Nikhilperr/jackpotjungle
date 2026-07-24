import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { performSignOut } from "@/lib/sign-out";
import {
  SESSION_KILL_EVENT,
  sessionKillChannelName,
  type SessionKillPayload,
} from "@/lib/session-kill";

/**
 * Listen for remote "log out this device" broadcasts.
 * When another device terminates this session, sign out instantly (Messenger-style).
 */
export function useSessionKillListener(enabled = true) {
  const signingOut = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let mySessionId: string | null = null;
    let userId: string | null = null;

    const kickIfMine = async (payload: SessionKillPayload) => {
      if (!payload?.sessionId || !mySessionId) return;
      if (payload.sessionId !== mySessionId) return;
      if (signingOut.current) return;
      signingOut.current = true;
      toast.info("Signed out from another device.");
      try {
        await performSignOut();
      } catch (e) {
        console.error("[SessionKill] signOut failed:", e);
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          /* ignore */
        }
        window.location.href = "/app/auth?logout=true";
      }
    };

    const subscribe = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user?.id || cancelled) return;

      mySessionId = session.id;
      userId = session.user.id;

      channel = supabase.channel(sessionKillChannelName(userId), {
        config: { broadcast: { self: true } },
      });

      channel.on("broadcast", { event: SESSION_KILL_EVENT }, ({ payload }) => {
        void kickIfMine(payload as SessionKillPayload);
      });

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[SessionKill] Listening on ${sessionKillChannelName(userId!)}`);
        }
      });
    };

    void subscribe();

    // Re-check when app returns to foreground (missed broadcast while backgrounded).
    let removeAppListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app")
        .then(async ({ App }) => {
          const handle = await App.addListener("appStateChange", async (state) => {
            if (!state.isActive || !mySessionId) return;
            try {
              const { data, error } = await supabase.auth.getUser();
              if (error) {
                await kickIfMine({ sessionId: mySessionId, at: Date.now(), reason: "stale" });
                return;
              }
              const { data: sess } = await supabase.auth.getSession();
              if (!sess.session) {
                await kickIfMine({ sessionId: mySessionId, at: Date.now(), reason: "missing" });
              }
            } catch {
              if (mySessionId) {
                await kickIfMine({ sessionId: mySessionId, at: Date.now(), reason: "error" });
              }
            }
          });
          if (!cancelled) {
            removeAppListener = () => {
              void handle.remove();
            };
          } else {
            void handle.remove();
          }
        })
        .catch(() => {});
    }

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.id) mySessionId = session.id;
      if (session?.user?.id && session.user.id !== userId) {
        // User switched — resubscribe would be ideal; rare in this app.
        userId = session.user.id;
      }
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      removeAppListener?.();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled]);
}
