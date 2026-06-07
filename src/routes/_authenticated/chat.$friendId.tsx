import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, ArrowLeft, ImageIcon, Smile, Loader2, X, Search, ChevronUp, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/messenger/Avatar";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { uploadAndSign } from "@/lib/chat-media";
import { format, formatDistanceToNow } from "date-fns";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";

export const Route = createFileRoute("/_authenticated/chat/$friendId")({
  component: ChatView,
});

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  seen: boolean;
  delivered: boolean;
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
  const [uploading, setUploading] = useState(false);
  const [recUploading, setRecUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [friendTyping, setFriendTyping] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !mounted) return;
      setMeId(u.user.id);

      const [{ data: prof }, { data: msgs }] = await Promise.all([
        supabase.from("profiles").select("id, username, avatar_url, online, last_seen").eq("id", friendId).maybeSingle(),
        supabase.from("messages").select("*")
          .or(`and(sender_id.eq.${u.user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${u.user.id})`)
          .order("created_at", { ascending: true }).limit(500),
      ]);
      if (!mounted) return;
      setFriend(prof as Profile | null);
      setMessages((msgs as Message[]) ?? []);

      await supabase.from("messages").update({ seen: true, delivered: true } as any)
        .eq("sender_id", friendId).eq("receiver_id", u.user.id).eq("seen", false);
    })();
    return () => { mounted = false; };
  }, [friendId]);

  useEffect(() => {
    if (!meId) return;
    const pairKey = [meId, friendId].sort().join("-");

    const msgChannel = supabase
      .channel(`chat-${pairKey}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if ((m.sender_id === meId && m.receiver_id === friendId) ||
            (m.sender_id === friendId && m.receiver_id === meId)) {
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            // Reconcile optimistic temp message (same sender, same content/url, temp id)
            const idx = prev.findIndex((x) =>
              x.id.startsWith("temp-") &&
              x.sender_id === m.sender_id &&
              (x.content ?? null) === (m.content ?? null) &&
              (x.image_url ?? null) === (m.image_url ?? null) &&
              (x.audio_url ?? null) === (m.audio_url ?? null)
            );
            if (idx >= 0) {
              const copy = prev.slice();
              copy[idx] = m;
              return copy;
            }
            return [...prev, m];
          });
          if (m.receiver_id === meId) {
            supabase.from("messages").update({ seen: true, delivered: true } as any).eq("id", m.id).then();
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .subscribe();

    const typingChannel = supabase
      .channel(`typing-${pairKey}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        if ((payload.payload as { from: string })?.from === friendId) {
          setFriendTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setFriendTyping(false), 2500);
        }
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [meId, friendId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, friendTyping]);

  function onDraftChange(v: string) {
    setDraft(v);
    const now = Date.now();
    if (typingChannelRef.current && meId && now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { from: meId } });
    }
  }

  function addOptimistic(partial: Partial<Message>): string {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: meId!,
      receiver_id: friendId,
      content: null,
      image_url: null,
      audio_url: null,
      seen: false,
      delivered: false,
      created_at: new Date().toISOString(),
      ...partial,
    };
    setMessages((prev) => [...prev, optimistic]);
    return tempId;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !meId) return;
    const content = draft.trim();
    setDraft("");
    setShowEmoji(false);
    const tempId = addOptimistic({ content });
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: meId, receiver_id: friendId, content })
      .select()
      .single();
    if (error) {
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      setDraft(content);
      console.error(error);
      return;
    }
    if (data) {
      setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Message) : x)));
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !meId) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 8 * 1024 * 1024) { alert("Max 8 MB"); return; }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    const tempId = addOptimistic({ image_url: localPreview });
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const url = await uploadAndSign("chat-images", meId, file, ext, file.type);
      const { data } = await supabase
        .from("messages")
        .insert({ sender_id: meId, receiver_id: friendId, content: null, image_url: url } as any)
        .select()
        .single();
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Message) : x)));
      else setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, image_url: url } : x)));
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      alert("Upload failed.");
    }
    setUploading(false);
  }

  async function onVoice(blob: Blob, mime: string, ext: string) {
    if (!meId) return;
    setRecUploading(true);
    const localPreview = URL.createObjectURL(blob);
    const tempId = addOptimistic({ audio_url: localPreview });
    try {
      const url = await uploadAndSign("chat-audio", meId, blob, ext, mime);
      const { data } = await supabase
        .from("messages")
        .insert({ sender_id: meId, receiver_id: friendId, content: null, audio_url: url } as any)
        .select()
        .single();
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Message) : x)));
      else setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, audio_url: url } : x)));
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      alert("Voice upload failed.");
    }
    setRecUploading(false);
  }

  const matchIds = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages.filter((m) => m.content && m.content.toLowerCase().includes(q)).map((m) => m.id);
  })();

  useEffect(() => {
    if (!searchOpen || matchIds.length === 0) return;
    const idx = Math.min(activeMatch, matchIds.length - 1);
    const id = matchIds[idx];
    const el = msgRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeMatch, searchQuery, searchOpen, matchIds.length]);

  function highlight(text: string, q: string) {
    if (!q) return text;
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    const parts: React.ReactNode[] = [];
    let i = 0;
    while (i < text.length) {
      const found = lower.indexOf(ql, i);
      if (found === -1) { parts.push(text.slice(i)); break; }
      if (found > i) parts.push(text.slice(i, found));
      parts.push(<mark key={found} className="bg-yellow-300 text-black rounded px-0.5">{text.slice(found, found + q.length)}</mark>);
      i = found + q.length;
    }
    return parts;
  }

  if (!friend) return <div className="h-full flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="h-full flex flex-col">
      <header className="px-3 md:px-5 py-3 border-b border-border flex items-center gap-3 bg-card">
        <Link to="/chat" className="md:hidden h-9 w-9 -ml-1 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="relative">
          <Avatar name={friend.username} url={friend.avatar_url} size={40} />
          {friend.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{friend.username}</p>
          <p className="text-xs text-muted-foreground truncate">
            {friendTyping ? "Typing…" : friend.online ? "Active now" :
              friend.last_seen ? `Active ${formatDistanceToNow(new Date(friend.last_seen), { addSuffix: true })}` : "Offline"}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">No messages yet. Say hi 👋</div>
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
              {isLastMine && (
                <div className="flex justify-end pr-1 pt-0.5">
                  <span className="text-[11px] text-muted-foreground">
                    {m.seen ? "Seen" : m.delivered ? "Delivered" : "Sent"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {friendTyping && (
          <div className="flex justify-start pt-1">
            <div className="bg-bubble-them text-bubble-them-foreground px-4 py-2 rounded-3xl">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {showEmoji && (
        <div className="border-t border-border bg-card">
          <EmojiPicker onEmojiClick={(d) => onDraftChange(draft + d.emoji)} theme={Theme.AUTO} emojiStyle={EmojiStyle.NATIVE}
            width="100%" height={320} previewConfig={{ showPreview: false }} skinTonesDisabled lazyLoadEmojis />
        </div>
      )}

      <form onSubmit={send} className="p-3 border-t border-border flex items-center gap-2 bg-card">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50" aria-label="Send image">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
        <VoiceRecorder onRecorded={onVoice} uploading={recUploading} />
        <button type="button" onClick={() => setShowEmoji((v) => !v)}
          className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center hover:bg-secondary ${showEmoji ? "text-primary" : "text-muted-foreground"}`} aria-label="Emoji">
          <Smile className="h-5 w-5" />
        </button>
        <Input value={draft} onChange={(e) => onDraftChange(e.target.value)} placeholder="Aa"
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
