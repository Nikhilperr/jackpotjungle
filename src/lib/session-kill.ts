/** Shared channel helpers for instant remote session logout (Messenger-style). */

export const SESSION_KILL_EVENT = "session_killed";
export const SESSIONS_CHANGED_EVENT = "sessions_changed";

export const FORCED_LOGOUT_KEY = "jj_forced_logout";
export const FORCED_LOGOUT_MSG_KEY = "jj_forced_logout_msg";

export function sessionKillChannelName(userId: string) {
  return `session-kill:${userId}`;
}

export type SessionKillPayload = {
  sessionId: string;
  at: number;
  reason?: string;
};

export type SessionsChangedPayload = {
  at: number;
  action: "terminated" | "login" | "refresh";
  sessionId?: string;
};

export function markForcedLogout(message = "You have been logged out.") {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FORCED_LOGOUT_KEY, "1");
    sessionStorage.setItem(FORCED_LOGOUT_MSG_KEY, message);
    sessionStorage.setItem("jj_signing_out", "1");
  } catch {
    /* ignore */
  }
}

export function consumeForcedLogoutMessage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const flagged = sessionStorage.getItem(FORCED_LOGOUT_KEY) === "1";
    const msg = sessionStorage.getItem(FORCED_LOGOUT_MSG_KEY);
    sessionStorage.removeItem(FORCED_LOGOUT_KEY);
    sessionStorage.removeItem(FORCED_LOGOUT_MSG_KEY);
    return flagged ? msg || "You have been logged out." : null;
  } catch {
    return null;
  }
}

/**
 * Broadcast a session kill from the terminating client (peer path).
 * Works even if the server Realtime kick fails — other devices listening receive this.
 */
export async function broadcastSessionKillClient(
  supabase: { channel: (name: string, opts?: any) => any; removeChannel: (ch: any) => any },
  userId: string,
  sessionId: string,
) {
  const topic = sessionKillChannelName(userId);
  const channel = supabase.channel(topic, {
    config: { broadcast: { self: true, ack: false } },
  });

  const killPayload: SessionKillPayload = {
    sessionId,
    at: Date.now(),
    reason: "terminated",
  };
  const changedPayload: SessionsChangedPayload = {
    at: Date.now(),
    action: "terminated",
    sessionId,
  };

  try {
    if (typeof channel.httpSend === "function") {
      await Promise.all([
        channel.httpSend(SESSION_KILL_EVENT, killPayload),
        channel.httpSend(SESSIONS_CHANGED_EVENT, changedPayload),
      ]);
      return;
    }
  } catch (e) {
    console.warn("[SessionKill] httpSend failed, falling back to WS:", e);
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("subscribe timeout")), 2500);
      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(t);
          resolve();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(t);
          reject(new Error(status));
        }
      });
    });
    await channel.send({ type: "broadcast", event: SESSION_KILL_EVENT, payload: killPayload });
    await channel.send({ type: "broadcast", event: SESSIONS_CHANGED_EVENT, payload: changedPayload });
  } finally {
    void supabase.removeChannel(channel);
  }
}
