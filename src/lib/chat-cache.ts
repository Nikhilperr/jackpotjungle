/**
 * chat-cache.ts
 * Module-level in-memory cache for friend profiles and messages.
 * Persists for the lifetime of the SPA session so revisiting a chat is instant.
 */

import { supabase } from "@/integrations/supabase/client";

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

const MESSAGE_CACHE_TTL_MS = 30_000; // 30 s — stale after this, will refresh silently

// ─── Profile cache ────────────────────────────────────────────────────────────
export function getCachedProfile(friendId: string): CachedProfile | undefined {
  return profileCache.get(friendId);
}

export function setCachedProfile(friendId: string, profile: CachedProfile) {
  profileCache.set(friendId, profile);
}

// ─── Message cache ────────────────────────────────────────────────────────────
function msgKey(meId: string, friendId: string) {
  return [meId, friendId].sort().join("-");
}

export function getCachedMessages(meId: string, friendId: string): CachedMessage[] | null {
  const entry = messageCache.get(msgKey(meId, friendId));
  if (!entry) return null;
  if (Date.now() - entry.loadedAt > MESSAGE_CACHE_TTL_MS) return null; // expired
  return entry.messages;
}

export function setCachedMessages(meId: string, friendId: string, messages: CachedMessage[]) {
  messageCache.set(msgKey(meId, friendId), { messages, loadedAt: Date.now() });
}

export function invalidateMessageCache(meId: string, friendId: string) {
  messageCache.delete(msgKey(meId, friendId));
}

// ─── Page Message cache ───────────────────────────────────────────────────────
export function getCachedPageMessages(conversationId: string): CachedPageMessage[] | null {
  const entry = pageMessageCache.get(conversationId);
  if (!entry) return null;
  if (Date.now() - entry.loadedAt > MESSAGE_CACHE_TTL_MS) return null; // expired
  return entry.messages;
}

export function setCachedPageMessages(conversationId: string, messages: CachedPageMessage[]) {
  pageMessageCache.set(conversationId, { messages, loadedAt: Date.now() });
}

export function invalidatePageMessageCache(conversationId: string) {
  pageMessageCache.delete(conversationId);
}

// ─── Prefetch ─────────────────────────────────────────────────────────────────
/**
 * Call this on onPointerDown / onMouseEnter of a chat row.
 * Starts fetching profile + latest 50 messages in the background immediately
 * so by the time the user navigates, data is already in the cache.
 */
export function prefetchConversation(meId: string, friendId: string) {
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
