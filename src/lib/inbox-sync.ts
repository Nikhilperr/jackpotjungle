/**
 * Inbox / thread sync helpers for native-first messaging.
 * Soft-revalidate + catch-up without full conversation rebuilds.
 */

import { supabase } from "@/integrations/supabase/client";
import { localDbSetInbox } from "@/lib/local-db";

export const INBOX_CACHE_KEY = "jj_cached_conversations";
export const INBOX_SYNCED_AT_KEY = "jj_inbox_synced_at";
/** Full rebuild if cache older than this (ms). */
export const INBOX_FULL_REBUILD_TTL_MS = 5 * 60 * 1000;

export type InboxPreviewPatch = {
  peerKey: string; // friendId or group-<id>
  lastMessage: string | null;
  lastAt: string;
  unreadBump: number;
  isGroup: boolean;
};

export function getInboxSyncedAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = localStorage.getItem(INBOX_SYNCED_AT_KEY);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

export function setInboxSyncedAt(ts = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INBOX_SYNCED_AT_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

export function hasWarmInboxCache(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(INBOX_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

/** True when a full list rebuild should run immediately. */
export function shouldFullRebuildInbox(force = false): boolean {
  if (force) return true;
  if (!hasWarmInboxCache()) return true;
  const synced = getInboxSyncedAt();
  if (!synced) return true;
  return Date.now() - synced > INBOX_FULL_REBUILD_TTL_MS;
}

/** Stable typing channel shared by both peers (or all group members). */
export function typingChannelName(args: {
  meId: string;
  friendId: string;
  isGroup: boolean;
  groupId?: string | null;
}): string {
  if (args.isGroup && args.groupId) {
    return `typing-group-${args.groupId}`;
  }
  const pair = [args.meId, args.friendId].sort().join("-");
  return `typing-dm-${pair}`;
}

/**
 * Merge server rows into cached messages by id (edits / seen / delivered).
 * Drops rows whose ids are in `deletedIds`.
 */
export function mergeMessageCatchUp<T extends { id: string }>(
  cached: T[],
  serverRows: T[],
  deletedIds?: Set<string>,
): T[] {
  const byId = new Map(cached.map((m) => [m.id, m]));
  for (const row of serverRows) {
    byId.set(row.id, { ...(byId.get(row.id) as T | undefined), ...row });
  }
  let next = Array.from(byId.values());
  if (deletedIds && deletedIds.size > 0) {
    next = next.filter((m) => !deletedIds.has(m.id));
  }
  return next;
}

/**
 * Delta inbox sync: only messages newer than the last sync watermark.
 * Returns preview patches to merge into the conversation list — not a full rebuild.
 */
export async function fetchInboxDeltaPatches(
  meId: string,
  sinceIso: string | null,
): Promise<InboxPreviewPatch[]> {
  let q = supabase
    .from("messages")
    .select("id, sender_id, receiver_id, group_id, content, image_url, audio_url, created_at, seen")
    .or(`sender_id.eq.${meId},receiver_id.eq.${meId}`)
    .order("created_at", { ascending: false })
    .limit(120);

  if (sinceIso) {
    q = q.gt("created_at", sinceIso);
  }

  const { data, error } = await q;
  if (error || !data?.length) return [];

  const latest = new Map<string, InboxPreviewPatch>();
  for (const m of data as any[]) {
    const isGroup = !!m.group_id;
    const peerKey = isGroup
      ? `group-${m.group_id}`
      : m.sender_id === meId
        ? m.receiver_id
        : m.sender_id;
    if (!peerKey) continue;
    if (latest.has(peerKey)) {
      const prev = latest.get(peerKey)!;
      if (m.receiver_id === meId && !m.seen) prev.unreadBump += 1;
      continue;
    }
    const preview = m.image_url
      ? "📷 Photo"
      : m.audio_url
        ? "🎤 Voice message"
        : (m.content as string | null);
    latest.set(peerKey, {
      peerKey,
      lastMessage: preview,
      lastAt: m.created_at,
      unreadBump: m.receiver_id === meId && !m.seen ? 1 : 0,
      isGroup,
    });
  }
  return Array.from(latest.values());
}

export async function persistInboxCache(conversations: unknown[]) {
  setInboxSyncedAt();
  try {
    localStorage.setItem(INBOX_CACHE_KEY, JSON.stringify(conversations));
  } catch {
    /* ignore */
  }
  await localDbSetInbox(conversations);
}
