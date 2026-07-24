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

/** True only for definitive auth failures — never for offline / network blips. */
function isDefinitiveAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; code?: string; message?: string; name?: string };
  const status = e.status;
  if (status === 401 || status === 403) return true;
  const code = String(e.code || "").toLowerCase();
  if (
    code.includes("session_not_found") ||
    code.includes("invalid_token") ||
    code.includes("refresh_token") ||
    code.includes("user_not_found")
  ) {
    return true;
  }
  const msg = String(e.message || "").toLowerCase();
  if (
    msg.includes("invalid refresh token") ||
    msg.includes("session from session_id claim in jwt does not exist") ||
    msg.includes("user from sub claim in jwt does not exist")
  ) {
    return true;
  }
  // Network / timeout / Abort — keep the UI; do not kick.
  if (
    e.name === "AuthRetryableFetchError" ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("abort")
  ) {
    return false;
  }
  return false;
}

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

    // Soft re-check on resume — never kick on network blips (that caused black reload flashes).
    const softAuthRecheck = async () => {
      if (!mySessionId || signingOut.current) return;
      try {
        const { data: local } = await supabase.auth.getSession();
        if (!local.session) {
          const { data, error } = await supabase.auth.getUser();
          if (error && isDefinitiveAuthFailure(error)) {
            await kickNow();
            return;
          }
          if (!data.user) await kickNow();
          return;
        }
        const { error } = await supabase.auth.getUser();
        if (error && isDefinitiveAuthFailure(error)) await kickNow();
      } catch {
        /* offline / flaky — keep chat painted */
      }
    };

    let removeAppListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app")
        .then(async ({ App }) => {
          const handle = await App.addListener("appStateChange", async (state) => {
            if (!state.isActive) return;
            await softAuthRecheck();
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

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void softAuthRecheck();
    };
    document.addEventListener("visibilitychange", onVisible);

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.id) mySessionId = session.id;
      if (session?.user?.id) userId = session.user.id;
      if (
        (event === "TOKEN_REFRESHED" && !session) ||
        (event === "SIGNED_OUT" && sessionStorage.getItem(FORCED_LOGOUT_KEY) !== "1")
      ) {
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
