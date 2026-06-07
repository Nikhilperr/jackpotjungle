import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, ArrowLeft, ImageIcon, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { uploadAndSign } from "@/lib/chat-media";

export const Route = createFileRoute("/_authenticated/chat/page")({
  component: PageChatView,
});

type Msg = {
  id: string;
  sender_id: string;
  from_page: boolean;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  seen: boolean;
  created_at: string;
};

function PageChatView() {
  const [meId, setMeId] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recUploading, setRecUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !mounted) return;
      setMeId(u.user.id);

      let { data: conv } = await supabase.from("page_conversations").select("id").eq("user_id", u.user.id).maybeSingle();
      if (!conv) {
        const ins = await supabase.from("page_conversations").insert({ user_id: u.user.id }).select("id").single();
        conv = ins.data;
      }
      if (!conv || !mounted) return;
      setConvId(conv.id);

      const { data: msgs } = await supabase.from("page_messages")
        .select("id, sender_id, from_page, content, image_url, audio_url, seen, created_at")
        .eq("conversation_id", conv.id).order("created_at", { ascending: true });
      if (mounted) setMessages((msgs as Msg[]) ?? []);

      await supabase.from("page_messages").update({ seen: true }).eq("conversation_id", conv.id).eq("from_page", true).eq("seen", false);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!convId) return;
    const ch = supabase
      .channel(`user-page-${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "page_messages", filter: `conversation_id=eq.${convId}` }, (payload) => {
        const m = payload.new as Msg;
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          const idx = prev.findIndex((x) =>
            x.id.startsWith("temp-") &&
            x.from_page === m.from_page &&
            (x.content ?? null) === (m.content ?? null) &&
            (x.image_url ?? null) === (m.image_url ?? null) &&
            (x.audio_url ?? null) === (m.audio_url ?? null)
          );
          if (idx >= 0) { const copy = prev.slice(); copy[idx] = m; return copy; }
          return [...prev, m];
        });
        if (m.from_page) supabase.from("page_messages").update({ seen: true }).eq("id", m.id).then();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [convId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function addOptimistic(partial: Partial<Msg>): string {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Msg = {
      id: tempId,
      sender_id: meId!,
      from_page: false,
      content: null,
      image_url: null,
      audio_url: null,
      seen: false,
      created_at: new Date().toISOString(),
      ...partial,
    };
    setMessages((prev) => [...prev, optimistic]);
    return tempId;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !meId || !convId) return;
    const content = draft.trim();
    setDraft("");
    const tempId = addOptimistic({ content });
    const { data, error } = await supabase
      .from("page_messages")
      .insert({ conversation_id: convId, sender_id: meId, from_page: false, content })
      .select()
      .single();
    if (error) {
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      setDraft(content);
      console.error(error);
      return;
    }
    if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Msg) : x)));
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !meId || !convId) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 8 * 1024 * 1024) { alert("Max 8 MB"); return; }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    const tempId = addOptimistic({ image_url: localPreview });
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const url = await uploadAndSign("chat-images", meId, file, ext, file.type);
      const { data } = await supabase
        .from("page_messages")
        .insert({ conversation_id: convId, sender_id: meId, from_page: false, content: null, image_url: url } as any)
        .select()
        .single();
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Msg) : x)));
      else setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, image_url: url } : x)));
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      alert("Upload failed.");
    }
    setUploading(false);
  }

  async function onVoice(blob: Blob, mime: string, ext: string) {
    if (!meId || !convId) return;
    setRecUploading(true);
    const localPreview = URL.createObjectURL(blob);
    const tempId = addOptimistic({ audio_url: localPreview });
    try {
      const url = await uploadAndSign("chat-audio", meId, blob, ext, mime);
      const { data } = await supabase
        .from("page_messages")
        .insert({ conversation_id: convId, sender_id: meId, from_page: false, content: null, audio_url: url } as any)
        .select()
        .single();
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Msg) : x)));
      else setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, audio_url: url } : x)));
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      alert("Voice upload failed.");
    }
    setRecUploading(false);
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
                {m.image_url ? (
                  <button onClick={() => setPreview(m.image_url)} className="max-w-[70%] rounded-3xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary">
                    <img src={m.image_url} alt="" className="block max-h-80 w-auto object-cover" />
                  </button>
                ) : m.audio_url ? (
                  <div className={`max-w-[80%] px-3 py-2 rounded-3xl ${mine ? "bg-bubble-me" : "bg-bubble-them"}`}>
                    <audio controls src={m.audio_url} className="h-10 max-w-[260px]" />
                  </div>
                ) : (
                  <div className={`max-w-[70%] px-4 py-2 rounded-3xl ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"}`}>
                    <p className="text-[15px] whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="p-3 border-t border-border flex items-center gap-2 bg-card">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50" aria-label="Send image">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
        <VoiceRecorder onRecorded={onVoice} uploading={recUploading} />
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message Jackpot Jungle"
          className="rounded-full bg-secondary border-transparent" />
        <Button type="submit" size="icon" disabled={!draft.trim() || sending} className="rounded-full shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </form>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <button onClick={() => setPreview(null)} className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <img src={preview} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}
