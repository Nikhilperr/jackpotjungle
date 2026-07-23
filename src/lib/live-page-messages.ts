import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type LivePageMsg = {
  id: string;
  conversation_id?: string;
  sender_id: string;
  from_page: boolean;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  seen: boolean;
  created_at: string;
};

type MsgLike = {
  id: string;
  from_page?: boolean;
  content?: string | null;
  image_url?: string | null;
  audio_url?: string | null;
};

/** Merge a single realtime/polled page message into the thread (dedupe + temp reconcile). */
export function mergeIncomingPageMessage<T extends MsgLike>(prev: T[], incoming: T): T[] {
  const exactIdx = prev.findIndex((x) => x.id === incoming.id);
  if (exactIdx >= 0) {
    const cur = prev[exactIdx];
    const same =
      (cur.content ?? null) === (incoming.content ?? null) &&
      (cur.image_url ?? null) === (incoming.image_url ?? null) &&
      (cur.audio_url ?? null) === (incoming.audio_url ?? null) &&
      (cur as any).seen === (incoming as any).seen &&
      (cur as any).from_page === (incoming as any).from_page;
    if (same) return prev;
    const copy = prev.slice();
    copy[exactIdx] = { ...cur, ...incoming };
    return copy;
  }

  const tempIdx = prev.findIndex(
    (x) =>
      typeof x.id === "string" &&
      x.id.startsWith("temp-") &&
      x.from_page === incoming.from_page &&
      (x.content ?? null) === (incoming.content ?? null) &&
      (x.image_url ?? null) === (incoming.image_url ?? null) &&
      (x.audio_url ?? null) === (incoming.audio_url ?? null),
  );
  if (tempIdx >= 0) {
    const copy = prev.slice();
    copy[tempIdx] = { ...copy[tempIdx], ...incoming };
    return copy;
  }

  return [...prev, incoming];
}

export function mergeIncomingPageMessageBatch<T extends MsgLike>(prev: T[], batch: T[]): T[] {
  let next = prev;
  for (const m of batch) {
    next = mergeIncomingPageMessage(next, m);
  }
  return next;
}

const PAGE_MSG_SELECT =
  "id, conversation_id, sender_id, from_page, content, image_url, audio_url, seen, created_at";

/** Fetch messages newer than `sinceIso` (exclusive). If no since, returns latest `limit` ascending. */
export async function fetchPageMessagesDelta(
  conversationId: string,
  sinceIso: string | null,
  limit = 50,
): Promise<LivePageMsg[]> {
  if (sinceIso) {
    const { data, error } = await supabase
      .from("page_messages")
      .select(PAGE_MSG_SELECT)
      .eq("conversation_id", conversationId)
      .gt("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) {
      console.warn("[live-page-messages] delta failed:", error.message);
      return [];
    }
    return (data ?? []) as LivePageMsg[];
  }

  const { data, error } = await supabase
    .from("page_messages")
    .select(PAGE_MSG_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[live-page-messages] recent fetch failed:", error.message);
    return [];
  }
  return ([...(data ?? [])] as LivePageMsg[]).reverse();
}

/** Recent page messages across all conversations (admin inbox soft catch-up). */
export async function fetchRecentPageMessagesGlobal(limit = 40): Promise<LivePageMsg[]> {
  const { data, error } = await supabase
    .from("page_messages")
    .select(PAGE_MSG_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[live-page-messages] global recent failed:", error.message);
    return [];
  }
  return (data ?? []) as LivePageMsg[];
}

type AttachOpts = {
  conversationId: string;
  channelPrefix: string;
  /** Latest known message timestamp in the open thread (for delta poll). */
  getLatestCreatedAt: () => string | null;
  onInsert: (msg: LivePageMsg) => void;
  onUpdate: (msg: LivePageMsg) => void;
  onDelete: (id: string) => void;
  /** Polling fallback while the chat is open. Default 2000ms. */
  pollMs?: number;
};

/**
 * Realtime subscription + short poll + resume catch-up for one page conversation.
 * Returns a disposer.
 */
export function attachPageMessagesLive(opts: AttachOpts): () => void {
  let disposed = false;
  let channel: RealtimeChannel | null = null;
  let resubTimer: ReturnType<typeof setTimeout> | null = null;
  const pollMs = opts.pollMs ?? 2000;

  const catchUp = async () => {
    if (disposed) return;
    const since = opts.getLatestCreatedAt();
    const rows = await fetchPageMessagesDelta(opts.conversationId, since, 80);
    for (const m of rows) opts.onInsert(m);
  };

  const subscribe = () => {
    if (disposed) return;
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
      channel = null;
    }

    const rand = Math.random().toString(36).slice(2, 9);
    const ch = supabase
      .channel(`${opts.channelPrefix}-${opts.conversationId}-${rand}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "page_messages",
          filter: `conversation_id=eq.${opts.conversationId}`,
        },
        (payload) => {
          const m = payload.new as LivePageMsg;
          if (m?.id) opts.onInsert(m);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "page_messages",
          filter: `conversation_id=eq.${opts.conversationId}`,
        },
        (payload) => {
          const m = payload.new as LivePageMsg;
          if (m?.id) opts.onUpdate(m);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "page_messages",
          filter: `conversation_id=eq.${opts.conversationId}`,
        },
        (payload) => {
          const oldId = (payload.old as { id?: string })?.id;
          if (oldId) opts.onDelete(oldId);
        },
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          void catchUp();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (resubTimer) clearTimeout(resubTimer);
          resubTimer = setTimeout(subscribe, 1200);
        }
      });

    channel = ch;
  };

  subscribe();

  const pollId = setInterval(() => {
    void catchUp();
  }, pollMs);

  const onResume = () => {
    void catchUp();
    subscribe();
  };
  window.addEventListener("jj-app-foreground", onResume);
  window.addEventListener("jj-network-restored", onResume);

  // Visibility: when returning to the tab/WebView, pull immediately.
  const onVis = () => {
    if (document.visibilityState === "visible") onResume();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    disposed = true;
    clearInterval(pollId);
    if (resubTimer) clearTimeout(resubTimer);
    window.removeEventListener("jj-app-foreground", onResume);
    window.removeEventListener("jj-network-restored", onResume);
    document.removeEventListener("visibilitychange", onVis);
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    }
  };
}
