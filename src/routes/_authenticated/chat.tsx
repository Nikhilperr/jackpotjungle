import { createFileRoute, Link, Outlet, useParams, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/messenger/AppShell";
import { Input } from "@/components/ui/input";
import { Search, MessageCircle, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
};

function ChatLayout() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pageUnread, setPageUnread] = useState(0);
  const [pageLast, setPageLast] = useState<{ content: string | null; at: string | null }>({ content: null, at: null });
  const [search, setSearch] = useState("");
  const [, setMeId] = useState<string | null>(null);
  const params = useParams({ strict: false }) as { friendId?: string };
  const location = useLocation();
  const activeId = params.friendId;
  const isPageActive = location.pathname.endsWith("/chat/page");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !mounted) return;
      setMeId(u.user.id);
      await load(u.user.id);
    })();

    async function load(myId: string) {
      // get friendships
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
      // last messages
      const { data: msgs } = await supabase
        .from("messages")
        .select("sender_id, receiver_id, content, created_at, seen")
        .or(friendIds.map((id) => `and(sender_id.eq.${id},receiver_id.eq.${myId}),and(sender_id.eq.${myId},receiver_id.eq.${id})`).join(","))
        .order("created_at", { ascending: false })
        .limit(500);
      const byFriend: Record<string, Conversation> = {};
      (profiles ?? []).forEach((p) => {
        byFriend[p.id] = { friendId: p.id, username: p.username, avatar_url: p.avatar_url, online: p.online, lastMessage: null, lastAt: null, unread: 0 };
      });
      (msgs ?? []).forEach((m) => {
        const fid = m.sender_id === myId ? m.receiver_id : m.sender_id;
        const c = byFriend[fid];
        if (!c) return;
        if (!c.lastAt) { c.lastMessage = m.content; c.lastAt = m.created_at; }
        if (m.receiver_id === myId && !m.seen) c.unread++;
      });
      if (mounted) {
        setConversations(Object.values(byFriend).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")));
      }
    }

    // realtime: any new message refreshes the list
    const channel = supabase
      .channel("conv-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        supabase.auth.getUser().then(({ data }) => { if (data.user) load(data.user.id); });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        supabase.auth.getUser().then(({ data }) => { if (data.user) load(data.user.id); });
      })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  const filtered = conversations.filter((c) =>
    !search || c.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="flex h-full">
        <div className="w-full max-w-sm border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="text-xl font-bold mb-3">Chats</h2>
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
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {conversations.length === 0
                  ? "No conversations yet. Add a friend to start chatting."
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
        <div className="flex-1 min-w-0">
          {activeId ? <Outlet /> : <EmptyState />}
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

export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase();
  return url ? (
    <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div
      className="rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}
