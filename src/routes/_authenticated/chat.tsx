import { createFileRoute, Link, Outlet, useParams, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Input } from "@/components/ui/input";
import { Search, MessageCircle, Sparkles, Ban, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "@/components/messenger/Avatar";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { PullToRefresh } from "@/components/messenger/PullToRefresh";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Chats — JJ Messenger" }] }),
  component: ChatLayout,
});

type Conversation = {
  friendId: string;
  username: string;
  avatar_url: string | null;
  online: boolean;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
  allText: string;
};

function ChatLayout() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [spamIds, setSpamIds] = useState<Set<string>>(new Set());
  const [spammedByIds, setSpammedByIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"all" | "spam">("all");
  const [pageUnread, setPageUnread] = useState(0);
  const [pageLast, setPageLast] = useState<{ content: string | null; at: string | null }>({ content: null, at: null });
  const [search, setSearch] = useState("");
  const [meId, setMeId] = useState<string | null>(null);
  const params = useParams({ strict: false }) as { friendId?: string };
  const location = useLocation();
  const activeId = params.friendId;
  const isPageActive = location.pathname.endsWith("/chat/page");
  const { isAdmin } = useRole();
  const hasActive = !!activeId || isPageActive;

  async function loadSpam(myId: string) {
    const [{ data: outgoing }, { data: incoming }] = await Promise.all([
      supabase.from("spam_list").select("spammed_user_id").eq("user_id", myId),
      supabase.from("spam_list").select("user_id").eq("spammed_user_id", myId),
    ]);
    setSpamIds(new Set((outgoing ?? []).map((r: any) => r.spammed_user_id)));
    setSpammedByIds(new Set((incoming ?? []).map((r: any) => r.user_id)));
  }

  async function loadPage(myId: string) {
    const { data: conv } = await supabase
      .from("page_conversations")
      .select("id")
      .eq("user_id", myId)
      .maybeSingle();
    if (!conv) return;
    const { data: last } = await supabase
      .from("page_messages")
      .select("content, created_at, from_page, seen")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const arr = last ?? [];
    const first = arr[0];
    setPageLast({ content: first?.content ?? null, at: first?.created_at ?? null });
    setPageUnread(arr.filter((m) => m.from_page && !m.seen).length);
  }

  async function load(myId: string) {
    const { data: friends } = await supabase
      .from("friendships")
      .select("user_a, user_b");
    if (!friends) return;
    const friendIds = friends.map((f) => (f.user_a === myId ? f.user_b : f.user_a));
    if (friendIds.length === 0) { setConversations([]); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, online")
      .in("id", friendIds);
    const { data: msgs } = await supabase
      .from("messages")
      .select("sender_id, receiver_id, content, image_url, audio_url, created_at, seen")
      .or(friendIds.map((id) => `and(sender_id.eq.${id},receiver_id.eq.${myId}),and(sender_id.eq.${myId},receiver_id.eq.${id})`).join(","))
      .order("created_at", { ascending: false })
      .limit(500);
    const byFriend: Record<string, Conversation> = {};
    (profiles ?? []).forEach((p) => {
      byFriend[p.id] = { friendId: p.id, username: p.username, avatar_url: p.avatar_url, online: p.online, lastMessage: null, lastAt: null, unread: 0, allText: "" };
    });
    (msgs ?? []).forEach((m: any) => {
      const fid = m.sender_id === myId ? m.receiver_id : m.sender_id;
      const c = byFriend[fid];
      if (!c) return;
      const preview = m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : m.content;
      if (!c.lastAt) { c.lastMessage = preview; c.lastAt = m.created_at; }
      if (m.content) c.allText += " " + m.content.toLowerCase();
      if (m.receiver_id === myId && !m.seen) c.unread++;
    });
    setConversations(Object.values(byFriend).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")));
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user && mounted) {
        setMeId(u.user.id);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!meId) return;
    let mounted = true;

    load(meId);
    loadPage(meId);
    loadSpam(meId);

    const channel = supabase
      .channel("conv-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        if (mounted) load(meId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        if (mounted) load(meId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "page_messages" }, () => {
        if (mounted) loadPage(meId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "spam_list" }, () => {
        if (mounted) loadSpam(meId);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [meId]);

  async function toggleSpam(e: React.MouseEvent, friendId: string, isSpam: boolean) {
    e.preventDefault();
    e.stopPropagation();
    if (!meId) return;
    if (isSpam) {
      const { error } = await supabase.from("spam_list").delete().eq("user_id", meId).eq("spammed_user_id", friendId);
      if (error) toast.error("Could not unspam"); else { toast.success("Removed from spam"); setSpamIds((s) => { const n = new Set(s); n.delete(friendId); return n; }); }
    } else {
      const { error } = await supabase.from("spam_list").insert({ user_id: meId, spammed_user_id: friendId });
      if (error) toast.error("Could not mark as spam"); else { toast.success("Moved to spam"); setSpamIds((s) => new Set(s).add(friendId)); }
    }
  }

  const q = search.trim().toLowerCase();
  const visible = conversations.filter((c) => (tab === "spam" ? spamIds.has(c.friendId) : !spamIds.has(c.friendId)));
  const filtered = visible.filter((c) =>
    !q || c.username.toLowerCase().includes(q) || c.allText.includes(q)
  );
  const spamCount = conversations.filter((c) => spamIds.has(c.friendId)).length;

  return (
    <AppShell>
      <div className="flex h-full">
        <div className={`${hasActive ? "hidden md:flex" : "flex"} w-full md:max-w-sm md:border-r md:border-border flex-col min-h-0`}>
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <HamburgerButton />
              <h2 className="text-xl font-bold">Chats</h2>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search Messenger"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-full bg-secondary border-transparent"
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setTab("all")}
                className={`flex-1 text-sm font-semibold py-1.5 rounded-full transition-colors ${tab === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
              >
                All
              </button>
              <button
                onClick={() => setTab("spam")}
                className={`flex-1 text-sm font-semibold py-1.5 rounded-full transition-colors flex items-center justify-center gap-1.5 ${tab === "spam" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
              >
                <Ban className="h-3.5 w-3.5" /> Spam{spamCount > 0 ? ` (${spamCount})` : ""}
              </button>
            </div>
          </div>
          <PullToRefresh onRefresh={async () => { if (meId) { await Promise.all([load(meId), loadPage(meId), loadSpam(meId)]); } }}>
            {!isAdmin && tab === "all" && (
              <Link
                to="/chat/page"
                className={`flex items-center gap-3 px-3 py-3 mx-2 my-1 rounded-xl hover:bg-secondary transition-colors ${isPageActive ? "bg-secondary" : ""}`}
              >
                <div className="relative shrink-0">
                  <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-primary-foreground" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate ${pageUnread > 0 ? "font-bold" : "font-semibold"}`}>Jackpot Jungle</p>
                    {pageLast.at && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(pageLast.at), { addSuffix: false })}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm truncate ${pageUnread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {pageLast.content ?? "Official page · Tap to message us"}
                  </p>
                </div>
                {pageUnread > 0 && <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-[10px] text-primary-foreground font-bold flex items-center justify-center shrink-0">{pageUnread}</span>}
              </Link>
            )}

            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {tab === "spam"
                  ? "No spam conversations."
                  : conversations.length === 0
                  ? "Add a friend with their friend code to chat 1-on-1."
                  : "No matches."}
              </div>
            ) : (
              filtered.map((c) => {
                const isSpam = spamIds.has(c.friendId);
                return (
                  <div key={c.friendId} className="group relative">
                    <Link
                      to="/chat/$friendId"
                      params={{ friendId: c.friendId }}
                      className={`flex items-center gap-3 px-3 py-3 mx-2 my-1 rounded-xl hover:bg-secondary transition-colors ${activeId === c.friendId ? "bg-secondary" : ""}`}
                    >
                      <div className="relative shrink-0">
                        <Avatar name={c.username} url={c.avatar_url} />
                        {c.online && !isSpam && !spammedByIds.has(c.friendId) && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
                      </div>
                      <div className="flex-1 min-w-0 pr-10">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`truncate ${c.unread > 0 ? "font-bold" : "font-semibold"}`}>{c.username}</p>
                          {c.lastAt && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatDistanceToNow(new Date(c.lastAt), { addSuffix: false })}
                            </span>
                          )}
                        </div>
                        <p className={`text-sm truncate ${c.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {c.lastMessage ?? "Say hi 👋"}
                        </p>
                      </div>
                      {c.unread > 0 && <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />}
                    </Link>
                    <button
                      onClick={(e) => toggleSpam(e, c.friendId, isSpam)}
                      title={isSpam ? "Remove from spam" : "Move to spam"}
                      aria-label={isSpam ? "Remove from spam" : "Move to spam"}
                      className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background border border-border items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex md:opacity-0 md:group-hover:opacity-100"
                      style={isSpam ? { opacity: 1 } : undefined}
                    >
                      {isSpam ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    </button>
                  </div>
                );
              })
            )}
          </PullToRefresh>
        </div>
        <div className={`${hasActive ? "flex" : "hidden md:flex"} flex-1 min-w-0 min-h-0 flex-col`}>
          {hasActive ? <Outlet /> : <EmptyState />}
        </div>
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <MessageCircle className="h-10 w-10 text-primary" />
      </div>
      <h3 className="text-xl font-semibold">Your messages</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Pick a conversation from the list, or head to Friends to add someone with their friend code.
      </p>
    </div>
  );
}

export { Avatar } from "@/components/messenger/Avatar";
