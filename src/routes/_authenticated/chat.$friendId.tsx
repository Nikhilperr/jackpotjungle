import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { Avatar } from "./chat";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/chat/$friendId")({
  component: ChatView,
});

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  seen: boolean;
  created_at: string;
};
type Profile = { id: string; username: string; avatar_url: string | null; online: boolean; last_seen: string };

function ChatView() {
  const { friendId } = useParams({ from: "/_authenticated/chat/$friendId" });
  const [meId, setMeId] = useState<string | null>(null);
  const [friend, setFriend] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !mounted) return;
      setMeId(u.user.id);

      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, online, last_seen")
        .eq("id", friendId)
        .maybeSingle();
      if (mounted) setFriend(prof as Profile | null);

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${u.user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${u.user.id})`)
        .order("created_at", { ascending: true })
        .limit(500);
      if (mounted) setMessages((msgs as Message[]) ?? []);

      // mark received messages as seen
      await supabase.from("messages").update({ seen: true })
        .eq("sender_id", friendId).eq("receiver_id", u.user.id).eq("seen", false);
    })();

    return () => { mounted = false; };
  }, [friendId]);

  // realtime subscription
  useEffect(() => {
    if (!meId) return;
    const channel = supabase
      .channel(`chat-${meId}-${friendId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          if ((m.sender_id === meId && m.receiver_id === friendId) ||
              (m.sender_id === friendId && m.receiver_id === meId)) {
            setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
            if (m.receiver_id === meId) {
              supabase.from("messages").update({ seen: true }).eq("id", m.id).then();
            }
          }
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meId, friendId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !meId || sending) return;
    setSending(true);
    const content = draft.trim();
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      sender_id: meId,
      receiver_id: friendId,
      content,
    });
    if (error) {
      setDraft(content);
      console.error(error);
    }
    setSending(false);
  }

  if (!friend) return <div className="h-full flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="h-full flex flex-col">
      <header className="px-5 py-3 border-b border-border flex items-center gap-3 bg-card">
        <Avatar name={friend.username} url={friend.avatar_url} size={40} />
        <div>
          <p className="font-semibold">{friend.username}</p>
          <p className="text-xs text-muted-foreground">{friend.online ? "Active now" : "Offline"}</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            No messages yet. Say hi 👋
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === meId;
          const prev = messages[i - 1];
          const showTime = !prev || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
          const next = messages[i + 1];
          const isLastMine = mine && (!next || next.sender_id !== meId);
          return (
            <div key={m.id}>
              {showTime && (
                <div className="text-center text-xs text-muted-foreground py-2">
                  {format(new Date(m.created_at), "MMM d, h:mm a")}
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[70%] px-4 py-2 rounded-3xl ${
                    mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"
                  }`}
                >
                  <p className="text-[15px] whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
              {isLastMine && (
                <div className="flex justify-end pr-1 pt-0.5">
                  <span className="text-[11px] text-muted-foreground">{m.seen ? "Seen" : "Sent"}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="p-3 border-t border-border flex items-center gap-2 bg-card">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Aa"
          className="rounded-full bg-secondary border-transparent"
          autoFocus
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || sending} className="rounded-full shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
