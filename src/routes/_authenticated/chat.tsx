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

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !mounted) return;
      setMeId(u.user.id);
      await Promise.all([load(u.user.id), loadPage(u.user.id), loadSpam(u.user.id)]);
    })();

    async function loadSpam(myId: string) {
      const { data } = await supabase
        .from("spam_list")
        .select("spammed_user_id")
        .eq("user_id", myId);
      if (mounted) setSpamIds(new Set((data ?? []).map((r: any) => r.spammed_user_id)));
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
      if (mounted) {
        setPageLast({ content: first?.content ?? null, at: first?.created_at ?? null });
        setPageUnread(arr.filter((m) => m.from_page && !m.seen).length);
      }
    }

    async function load(myId: string) {
      const { data: friends } = await supabase
        .from("friendships")
        .select("user_a, user_b");
      if (!friends || !mounted) return;
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
      if (mounted) {
        setConversations(Object.values(byFriend).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")));
      }
    }

    const channel = supabase
      .channel("conv-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        supabase.auth.getUser().then(({ data }) => { if (data.user) load(data.user.id); });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        supabase.auth.getUser().then(({ data }) => { if (data.user) load(data.user.id); });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "page_messages" }, () => {
        supabase.auth.getUser().then(({ data }) => { if (data.user) loadPage(data.user.id); });
      })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = conversations.filter((c) =>
    !q || c.username.toLowerCase().includes(q) || c.allText.includes(q)
  );

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
          </div>
          <div className="flex-1 overflow-y-auto">
            {!isAdmin && (
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
                {conversations.length === 0
                  ? "Add a friend with their friend code to chat 1-on-1."
                  : "No matches."}
              </div>
            ) : (
              filtered.map((c) => (
                <Link
                  key={c.friendId}
                  to="/chat/$friendId"
                  params={{ friendId: c.friendId }}
                  className={`flex items-center gap-3 px-3 py-3 mx-2 my-1 rounded-xl hover:bg-secondary transition-colors ${activeId === c.friendId ? "bg-secondary" : ""}`}
                >
                  <div className="relative shrink-0">
                    <Avatar name={c.username} url={c.avatar_url} />
                    {c.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
                  </div>
                  <div className="flex-1 min-w-0">
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
              ))
            )}
          </div>
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
