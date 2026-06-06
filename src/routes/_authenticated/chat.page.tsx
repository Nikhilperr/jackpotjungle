import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, ArrowLeft } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/chat/page")({
  component: PageChatView,
});

type Msg = { id: string; sender_id: string; from_page: boolean; content: string; seen: boolean; created_at: string };

function PageChatView() {
  const [meId, setMeId] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !mounted) return;
      setMeId(u.user.id);

      let { data: conv } = await supabase
        .from("page_conversations")
        .select("id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!conv) {
        const ins = await supabase
          .from("page_conversations")
          .insert({ user_id: u.user.id })
          .select("id")
          .single();
        conv = ins.data;
      }
      if (!conv || !mounted) return;
      setConvId(conv.id);

      const { data: msgs } = await supabase
        .from("page_messages")
        .select("id, sender_id, from_page, content, seen, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      if (mounted) setMessages(msgs ?? []);

      await supabase
        .from("page_messages")
        .update({ seen: true })
        .eq("conversation_id", conv.id)
        .eq("from_page", true)
        .eq("seen", false);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!convId) return;
    const ch = supabase
      .channel(`user-page-${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "page_messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.from_page) {
            supabase.from("page_messages").update({ seen: true }).eq("id", m.id).then();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [convId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !meId || !convId || sending) return;
    setSending(true);
    const content = draft.trim();
    setDraft("");
    const { error } = await supabase.from("page_messages").insert({
      conversation_id: convId,
      sender_id: meId,
      from_page: false,
      content,
    });
    if (error) { setDraft(content); console.error(error); }
    setSending(false);
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-3 md:px-5 py-3 border-b border-border flex items-center gap-3 bg-card">
        <Link to="/chat" className="md:hidden h-9 w-9 -ml-1 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">Jackpot Jungle</p>
          <p className="text-xs text-muted-foreground truncate">Official page · We usually reply within a few hours</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            Welcome to Jackpot Jungle 👋 Send us a message — an admin will reply soon.
          </div>
        )}
        {messages.map((m, i) => {
          const mine = !m.from_page;
          const prev = messages[i - 1];
          const showTime = !prev || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
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
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="p-3 border-t border-border flex items-center gap-2 bg-card">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message Jackpot Jungle"
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
