/**
 * chat-cache.ts
 * Module-level in-memory cache for friend profiles and messages.
 * Persists for the lifetime of the SPA session so revisiting a chat is instant.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  localDbGetMessages,
  localDbSetMessages,
  localDbDeleteMessages,
  localDbGetProfile,
  localDbSetProfile,
} from "@/lib/local-db";
import { dmConvKey, pageConvKey } from "@/lib/local-first-sync";

export type CachedProfile = {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url: string | null;
  online: boolean;
  last_seen: string;
};

export type CachedMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  seen: boolean;
  delivered: boolean;
  created_at: string;
  failed?: boolean;
};

export type CachedPageMessage = {
  id: string;
  sender_id: string;
  from_page: boolean;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  seen: boolean;
  created_at: string;
  failed?: boolean;
};

// ─── Stores ──────────────────────────────────────────────────────────────────
const profileCache = new Map<string, CachedProfile>();
const messageCache = new Map<string, { messages: CachedMessage[]; loadedAt: number }>();
const pageMessageCache = new Map<string, { messages: CachedPageMessage[]; loadedAt: number }>();
const inflight = new Set<string>(); // prevent duplicate in-flight requests

const MESSAGE_CACHE_TTL_MS = 5 * 60_000; // 5 min — local-first; delta sync handles freshness

// ─── Profile cache ────────────────────────────────────────────────────────────
export function getCachedProfile(friendId: string): CachedProfile | undefined {
  let cached = profileCache.get(friendId);
  if (!cached && typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(`jj_profile_${friendId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          cached = parsed;
          profileCache.set(friendId, cached!);
        } else {
          localStorage.removeItem(`jj_profile_${friendId}`);
        }
      }
    } catch {}
    // Durable hydrate for next tick / await path.
    void localDbGetProfile<CachedProfile>(friendId).then((p) => {
      if (p && !profileCache.has(friendId)) profileCache.set(friendId, p);
    });
  }
  return cached;
}

/** Await durable profile (local-first open). */
export async function hydrateCachedProfile(friendId: string): Promise<CachedProfile | undefined> {
  const mem = profileCache.get(friendId);
  if (mem) return mem;
  const fromDb = await localDbGetProfile<CachedProfile>(friendId);
  if (fromDb) {
    profileCache.set(friendId, fromDb);
    return fromDb;
  }
  return getCachedProfile(friendId);
}

export function setCachedProfile(friendId: string, profile: CachedProfile) {
  profileCache.set(friendId, profile);
  void localDbSetProfile(friendId, profile);
}

// ─── Message cache ────────────────────────────────────────────────────────────
function msgKey(meId: string, friendId: string) {
  return dmConvKey(meId, friendId);
}

export function getCachedMessages(meId: string, friendId: string): CachedMessage[] | null {
  const key = msgKey(meId, friendId);
  const entry = messageCache.get(key);
  if (entry) return entry.messages;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(`jj_msgs_${key}`);
      if (stored) {
        const messages = JSON.parse(stored);
        if (Array.isArray(messages)) {
          messageCache.set(key, { messages, loadedAt: Date.now() });
          void localDbSetMessages(key, messages);
          return messages;
        } else {
          localStorage.removeItem(`jj_msgs_${key}`);
        }
      }
    } catch {}
    void localDbGetMessages<CachedMessage>(key).then((msgs) => {
      if (msgs && !messageCache.has(key)) {
        messageCache.set(key, { messages: msgs, loadedAt: Date.now() });
      }
    });
  }
  return null;
}

/** Await IndexedDB hydrate — use on conversation open before network. */
export async function hydrateCachedMessages(
  meId: string,
  friendId: string,
): Promise<CachedMessage[] | null> {
  const key = msgKey(meId, friendId);
  const entry = messageCache.get(key);
  if (entry) return entry.messages;

  const fromDb = await localDbGetMessages<CachedMessage>(key);
  if (fromDb?.length) {
    messageCache.set(key, { messages: fromDb, loadedAt: Date.now() });
    return fromDb;
  }

  return getCachedMessages(meId, friendId);
}

export function setCachedMessages(meId: string, friendId: string, messages: CachedMessage[]) {
  const key = msgKey(meId, friendId);
  messageCache.set(key, { messages, loadedAt: Date.now() });
  void localDbSetMessages(key, messages);
}

export function invalidateMessageCache(meId: string, friendId: string) {
  const key = msgKey(meId, friendId);
  messageCache.delete(key);
  void localDbDeleteMessages(key);
}

// ─── Page Message cache ───────────────────────────────────────────────────────
export function getCachedPageMessages(conversationId: string): CachedPageMessage[] | null {
  const entry = pageMessageCache.get(conversationId);
  if (entry) return entry.messages;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(`jj_page_msgs_${conversationId}`);
      if (stored) {
        const messages = JSON.parse(stored);
        if (Array.isArray(messages)) {
          pageMessageCache.set(conversationId, { messages, loadedAt: Date.now() });
          void localDbSetMessages(pageConvKey(conversationId), messages);
          return messages;
        } else {
          localStorage.removeItem(`jj_page_msgs_${conversationId}`);
        }
      }
    } catch {}
    void localDbGetMessages<CachedPageMessage>(pageConvKey(conversationId)).then((msgs) => {
      if (msgs && !pageMessageCache.has(conversationId)) {
        pageMessageCache.set(conversationId, { messages: msgs, loadedAt: Date.now() });
      }
    });
  }
  return null;
}

export async function hydrateCachedPageMessages(
  conversationId: string,
): Promise<CachedPageMessage[] | null> {
  const entry = pageMessageCache.get(conversationId);
  if (entry) return entry.messages;
  const fromDb = await localDbGetMessages<CachedPageMessage>(pageConvKey(conversationId));
  if (fromDb?.length) {
    pageMessageCache.set(conversationId, { messages: fromDb, loadedAt: Date.now() });
    return fromDb;
  }
  return getCachedPageMessages(conversationId);
}

export function setCachedPageMessages(conversationId: string, messages: CachedPageMessage[]) {
  pageMessageCache.set(conversationId, { messages, loadedAt: Date.now() });
  void localDbSetMessages(pageConvKey(conversationId), messages);
  if (typeof window !== "undefined") {
    try {
      const slim = messages.length > 40 ? messages.slice(-40) : messages;
      localStorage.setItem(`jj_page_msgs_${conversationId}`, JSON.stringify(slim));
    } catch {}
  }
}

export function invalidatePageMessageCache(conversationId: string) {
  pageMessageCache.delete(conversationId);
  void localDbDeleteMessages(pageConvKey(conversationId));
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(`jj_page_msgs_${conversationId}`);
    } catch {}
  }
}

// ─── Group message cache (local-first) ───────────────────────────────────────
export async function hydrateCachedGroupMessages(groupId: string): Promise<any[] | null> {
  const key = `group-${groupId}`;
  const fromDb = await localDbGetMessages<any>(key);
  if (fromDb?.length) return fromDb;
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(`jj_group_msgs_${groupId}`);
    if (!stored) return null;
    const messages = JSON.parse(stored);
    if (!Array.isArray(messages)) return null;
    void localDbSetMessages(key, messages);
    return messages;
  } catch {
    return null;
  }
}

export function setCachedGroupMessagesDurable(groupId: string, messages: any[]) {
  const key = `group-${groupId}`;
  void localDbSetMessages(key, messages);
  if (typeof window !== "undefined") {
    try {
      const slim = messages.length > 40 ? messages.slice(-40) : messages;
      localStorage.setItem(`jj_group_msgs_${groupId}`, JSON.stringify(slim));
    } catch {}
  }
}

// ─── Prefetch ─────────────────────────────────────────────────────────────────
/**
 * Call this on onPointerDown / onMouseEnter of a chat row.
 * Starts fetching profile + latest 50 messages in the background immediately
 * so by the time the user navigates, data is already in the cache.
 */
export function prefetchConversation(meId: string, friendId: string) {
  // Groups / system / page threads use different queries — skip DM prefetch.
  if (
    !friendId ||
    friendId.startsWith("group-") ||
    friendId.startsWith("system-") ||
    friendId.startsWith("page-")
  ) {
    return;
  }

  // Profile
  const profileKey = `profile-${friendId}`;
  if (!profileCache.has(friendId) && !inflight.has(profileKey)) {
    inflight.add(profileKey);
    supabase
      .from("profiles")
      .select("id, username, first_name, last_name, avatar_url, online, last_seen")
      .eq("id", friendId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCachedProfile(friendId, data as CachedProfile);
        inflight.delete(profileKey);
      })
      .catch(() => inflight.delete(profileKey));
  }

  // Messages
  const key = msgKey(meId, friendId);
  const existing = messageCache.get(key);
  const isStale = !existing || Date.now() - existing.loadedAt > MESSAGE_CACHE_TTL_MS;
  if (isStale && !inflight.has(key)) {
    inflight.add(key);
    supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${meId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${meId})`
      )
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) {
          // Server returns newest-first; reverse for chronological display
          setCachedMessages(meId, friendId, (data as CachedMessage[]).reverse());
        }
        inflight.delete(key);
      })
      .catch(() => inflight.delete(key));
  }
}

// ─── Draft message persistence ────────────────────────────────────────────────
/**
 * Returns the persisted unsent draft for the given conversation (friendId or
 * group-<id>). Returns empty string when no draft exists.
 */
export function getDraft(conversationId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(`jj_draft_${conversationId}`) ?? "";
  } catch {
    return "";
  }
}

const draftTimers = new Map<string, any>();

/** Persist the current draft for a conversation. */
export function setDraft(conversationId: string, text: string) {
  if (typeof window === "undefined") return;
  if (draftTimers.has(conversationId)) {
    clearTimeout(draftTimers.get(conversationId));
  }
  draftTimers.set(conversationId, setTimeout(() => {
    try {
      if (text) {
        localStorage.setItem(`jj_draft_${conversationId}`, text);
      } else {
        localStorage.removeItem(`jj_draft_${conversationId}`);
      }
    } catch {}
    draftTimers.delete(conversationId);
  }, 400));
}

/** Remove the draft after a message is successfully sent. */
export function clearDraft(conversationId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`jj_draft_${conversationId}`);
  } catch {}
}
