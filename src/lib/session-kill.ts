/** Shared channel helpers for instant remote session logout (Messenger-style). */

export const SESSION_KILL_EVENT = "session_killed";
export const SESSIONS_CHANGED_EVENT = "sessions_changed";

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
