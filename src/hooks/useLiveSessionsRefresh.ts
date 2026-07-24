import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  SESSION_KILL_EVENT,
  SESSIONS_CHANGED_EVENT,
  sessionKillChannelName,
  type SessionsChangedPayload,
} from "@/lib/session-kill";

/**
 * Subscribe to sessions_changed for the current user and refetch the list live.
 */
export function useLiveSessionsRefresh(opts: {
  userId: string | undefined | null;
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
}) {
  const { userId, onRefresh, enabled = true } = opts;
  const [live, setLive] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const stableRefresh = useCallback(() => {
    void onRefreshRef.current();
  }, []);

  useEffect(() => {
    if (!enabled || !userId) return;

    const channel = supabase.channel(sessionKillChannelName(userId), {
      config: { broadcast: { self: true } },
    });

    channel.on("broadcast", { event: SESSIONS_CHANGED_EVENT }, (_msg) => {
      const payload = _msg.payload as SessionsChangedPayload;
      console.log("[Sessions] live change:", payload?.action);
      stableRefresh();
    });
    // Also refresh when a session is killed (same channel as kick listener).
    channel.on("broadcast", { event: SESSION_KILL_EVENT }, () => {
      stableRefresh();
    });

    channel.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
    });

    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [userId, enabled, stableRefresh]);

  return { live };
}
