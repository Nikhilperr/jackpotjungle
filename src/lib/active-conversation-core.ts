/**
 * Pure helpers for Messenger-style notification context (safe for server + client).
 */

export const ACTIVE_CONVERSATION_STALE_MS = 5 * 60 * 1000;

export function normalizeConversationKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = String(raw).trim();
  return key || null;
}

export function keysMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a === `group-${b}` || b === `group-${a}`) return true;
  if (a === "page" && b.startsWith("page:")) return true;
  if (b === "page" && a.startsWith("page:")) return true;
  return false;
}

export function conversationKeyFromPushData(
  data: Record<string, string | undefined> | null | undefined,
): string | null {
  if (!data) return null;
  const type = data.type;
  if (type === "call") return null;
  if (type === "chat" && data.sender_id) return normalizeConversationKey(data.sender_id);
  if (type === "group_chat" && data.group_id) return `group-${data.group_id}`;
  if ((type === "page_chat" || type === "admin_support") && data.conversation_id) {
    return `page:${data.conversation_id}`;
  }
  const path = data.routePath || data.url || "";
  const dm = path.match(/\/app\/chat\/([^/?#]+)/);
  if (dm?.[1] && dm[1] !== "page") {
    return decodeURIComponent(dm[1]);
  }
  const admin = path.match(/[?&]c=([^&]+)/);
  if (admin?.[1]) return `page:${decodeURIComponent(admin[1])}`;
  if (path.includes("/app/chat/page")) return "page";
  return null;
}

export function shouldSkipPushForRecipient(
  profile: {
    app_in_foreground?: boolean | null;
    active_conversation_key?: string | null;
    active_conversation_at?: string | null;
  } | null | undefined,
  conversationKey: string | null,
): boolean {
  if (!profile || !conversationKey) return false;
  if (!profile.app_in_foreground) return false;
  if (!profile.active_conversation_key) return false;
  if (profile.active_conversation_at) {
    const age = Date.now() - new Date(profile.active_conversation_at).getTime();
    if (!Number.isFinite(age) || age > ACTIVE_CONVERSATION_STALE_MS) return false;
  }
  return keysMatch(profile.active_conversation_key, conversationKey);
}
