/**
 * Local-first sync engine.
 *
 * Phone paints from local-db immediately.
 * Server only supplies differences (new / edited / deleted / seen).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  localDbGetMessages,
  localDbGetSyncCursor,
  localDbSetMessages,
  localDbSetSyncCursor,
  localDbUpsertMessages,
} from "@/lib/local-db";
import { mergeMessageCatchUp } from "@/lib/inbox-sync";

export type SyncMessage = {
  id: string;
  sender_id: string;
  receiver_id?: string | null;
  group_id?: string | null;
  content?: string | null;
  image_url?: string | null;
  audio_url?: string | null;
  seen?: boolean;
  delivered?: boolean;
  created_at: string;
  [key: string]: unknown;
};

export function dmConvKey(meId: string, friendId: string) {
  return [meId, friendId].sort().join("-");
}

export function groupConvKey(groupId: string) {
  return `group-${groupId}`;
}

export function pageConvKey(conversationId: string) {
  return `page-${conversationId}`;
}

/**
 * Delta-sync a DM thread:
 * 1) Return local messages immediately (caller paints).
 * 2) Fetch only rows newer than cursor + catch-up for recent ids.
 * 3) Merge into local-db and return the updated list.
 */
export async function syncDmThread(args: {
  meId: string;
  friendId: string;
  localMessages?: SyncMessage[] | null;
  pageSize?: number;
}): Promise<{ messages: SyncMessage[]; fromLocalOnly: boolean; hasOlder: boolean }> {
  const { meId, friendId, pageSize = 50 } = args;
  const key = dmConvKey(meId, friendId);
  const local =
    args.localMessages ??
    ((await localDbGetMessages<SyncMessage>(key)) || []);

  const cursor =
    (await localDbGetSyncCursor(key)) ||
    (local.length ? local[local.length - 1].created_at : null);

  // Offline / no session: return local mirror only.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { messages: local, fromLocalOnly: true, hasOlder: local.length >= pageSize };
  }

  try {
    if (local.length > 0 && cursor) {
      const catchUpIds = local
        .slice(-40)
        .map((m) => m.id)
        .filter((id) => id && !String(id).startsWith("temp-"));

      const [{ data: deltaMsgs }, { data: catchUpRows }] = await Promise.all([
        supabase
          .from("messages")
          .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)")
          .or(
            `and(sender_id.eq.${meId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${meId})`,
          )
          .gt("created_at", cursor)
          .order("created_at", { ascending: false })
          .limit(200),
        catchUpIds.length
          ? supabase
              .from("messages")
              .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)")
              .in("id", catchUpIds)
          : Promise.resolve({ data: [] as SyncMessage[] }),
      ]);

      const deletedIds = new Set<string>();
      const stillOnServer = new Set((catchUpRows ?? []).map((m: any) => m.id as string));
      for (const id of catchUpIds) {
        if (!stillOnServer.has(id)) deletedIds.add(id);
      }

      const merged = mergeMessageCatchUp(
        local,
        [...((catchUpRows ?? []) as SyncMessage[]), ...(((deltaMsgs ?? []) as SyncMessage[]).reverse())],
        deletedIds,
      ).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

      await localDbSetMessages(key, merged);
      return { messages: merged, fromLocalOnly: false, hasOlder: true };
    }

    // Cold conversation — first page only (never full history).
    const { data: msgs } = await supabase
      .from("messages")
      .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)")
      .or(
        `and(sender_id.eq.${meId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${meId})`,
      )
      .order("created_at", { ascending: false })
      .limit(pageSize + 1);

    const raw = (msgs ?? []) as SyncMessage[];
    const hasOlder = raw.length > pageSize;
    const page = raw.slice(0, pageSize).reverse();
    await localDbSetMessages(key, page);
    return { messages: page, fromLocalOnly: false, hasOlder };
  } catch (e) {
    console.warn("[local-first-sync] DM sync failed, serving local mirror:", e);
    return { messages: local, fromLocalOnly: true, hasOlder: local.length >= pageSize };
  }
}

/** Apply a realtime INSERT/UPDATE into the local mirror (no refetch). */
export async function applyRealtimeMessageToLocal(
  convKey: string,
  row: SyncMessage,
  event: "INSERT" | "UPDATE" | "DELETE",
): Promise<SyncMessage[]> {
  if (event === "DELETE") {
    return localDbUpsertMessages(convKey, [], { deleteIds: [row.id] });
  }
  const next = await localDbUpsertMessages(convKey, [row]);
  if (row.created_at) {
    const cursor = await localDbGetSyncCursor(convKey);
    if (!cursor || row.created_at > cursor) {
      await localDbSetSyncCursor(convKey, row.created_at);
    }
  }
  return next;
}

/** Persist older page batch above current local window. */
export async function prependOlderMessages(
  convKey: string,
  older: SyncMessage[],
): Promise<SyncMessage[]> {
  const existing = (await localDbGetMessages<SyncMessage>(convKey)) || [];
  const byId = new Map<string, SyncMessage>();
  for (const m of older) byId.set(m.id, m);
  for (const m of existing) byId.set(m.id, m);
  const next = Array.from(byId.values()).sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)),
  );
  const capped = next.length > 500 ? next.slice(-500) : next;
  await localDbSetMessages(convKey, capped);
  return capped;
}
