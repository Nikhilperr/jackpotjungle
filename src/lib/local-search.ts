/**
 * Local-first chat search — query cached message bodies without a server round-trip.
 */

import { localDbGetMessages } from "@/lib/local-db";

/** friendId / group-* → lowercase haystack of recent message text */
const searchIndex = new Map<string, string>();

export function indexConversationMessages(
  peerKey: string,
  messages: Array<{ content?: string | null }>,
) {
  const parts: string[] = [];
  for (const m of messages) {
    const c = (m.content || "").trim();
    if (!c || c.startsWith("[system:")) continue;
    parts.push(c);
  }
  searchIndex.set(peerKey, parts.join("\n").toLowerCase());
}

export function localSearchMatches(peerKey: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = searchIndex.get(peerKey);
  return !!hay && hay.includes(q);
}

/** Hydrate index from durable store for a list of conversation keys. */
export async function hydrateLocalSearchIndex(
  entries: Array<{ peerKey: string; convKey: string }>,
) {
  await Promise.all(
    entries.map(async ({ peerKey, convKey }) => {
      if (searchIndex.has(peerKey)) return;
      const msgs = await localDbGetMessages<{ content?: string | null }>(convKey);
      if (msgs?.length) indexConversationMessages(peerKey, msgs);
    }),
  );
}
