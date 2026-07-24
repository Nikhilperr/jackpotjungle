import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { performSignOut } from "@/lib/sign-out";
import {
  FORCED_LOGOUT_KEY,
  SESSION_KILL_EVENT,
  markForcedLogout,
  sessionKillChannelName,
  type SessionKillPayload,
} from "@/lib/session-kill";

const LOGOUT_MSG = "You have been logged out.";

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

    const kickNow = async () => {
      if (signingOut.current) return;
      signingOut.current = true;
      markForcedLogout(LOGOUT_MSG);
      toast.info(LOGOUT_MSG, { duration: 5000 });

      // Navigate / hard-redirect first so the user cannot keep chatting.
      try {
        if (!Capacitor.isNativePlatform()) {
          const hostname = window.location.hostname.toLowerCase();
          if (hostname.endsWith("playjackpotjungle.com")) {
            window.location.replace(
              "https://chat.playjackpotjungle.com/app/auth?logout=remote",
            );
            return;
          }
        }
      } catch {
        /* ignore */
      }

      try {
        await performSignOut(undefined, async (opts) => {
          const { getRouter } = await import("@/router");
          await getRouter().navigate({
            to: opts.to,
            search: { logout: "remote" },
            replace: true,
          });
        });
      } catch (e) {
        console.error("[SessionKill] signOut failed:", e);
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          /* ignore */
        }
        try {
          const { getRouter } = await import("@/router");
          await getRouter().navigate({
            to: "/app/auth",
            search: { logout: "remote" },
            replace: true,
          });
        } catch {
          window.location.href = "/app/auth?logout=remote";
        }
      }
    };

    const kickIfMine = async (payload: SessionKillPayload) => {
      if (!payload?.sessionId || !mySessionId) return;
      if (payload.sessionId !== mySessionId) return;
      await kickNow();
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
            if (!state.isActive || !mySessionId || signingOut.current) return;
            try {
              const { error } = await supabase.auth.getUser();
              if (error) {
                await kickNow();
                return;
              }
              const { data: sess } = await supabase.auth.getSession();
              if (!sess.session) await kickNow();
            } catch {
              await kickNow();
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

    // Visibility re-check on web (tab focus after being kicked).
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !mySessionId || signingOut.current) return;
      void supabase.auth.getUser().then(({ error }) => {
        if (error) void kickNow();
      });
    };
    document.addEventListener("visibilitychange", onVisible);

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.id) mySessionId = session.id;
      if (session?.user?.id) userId = session.user.id;
      // Token refresh failed after remote session delete → friendly logout, not "invalid token".
      if (
        (event === "TOKEN_REFRESHED" && !session) ||
        (event === "SIGNED_OUT" && sessionStorage.getItem(FORCED_LOGOUT_KEY) !== "1")
      ) {
        // Only auto-kick on unexpected sign-out if we still thought we had a session id.
        if (event === "SIGNED_OUT" && mySessionId && !signingOut.current) {
          // Manual logout elsewhere — leave alone.
        }
      }
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      removeAppListener?.();
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled]);
}
