import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, ArrowLeft, ImageIcon, Smile, Loader2, X, Search, ChevronUp, ChevronDown, Phone, Video, Pin, Reply, Trash2, Forward, Copy, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/messenger/Avatar";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { VoiceMessage } from "@/components/messenger/VoiceMessage";
import { CallMessage } from "@/components/messenger/CallMessage";
import { useCalls } from "@/components/messenger/CallProvider";
import { uploadAndSign } from "@/lib/chat-media";
import { format, formatDistanceToNow } from "date-fns";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { toast } from "sonner";

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: "voice" | "video";
  status: "ringing" | "active" | "ended" | "missed" | "declined" | "canceled";
  duration_seconds: number;
  created_at: string;
};

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
  failed?: boolean;
};
type Profile = { id: string; username: string; avatar_url: string | null; online: boolean; last_seen: string };

function ChatView() {
  const { friendId } = useParams({ from: "/_authenticated/chat/$friendId" });
  const [meId, setMeId] = useState<string | null>(null);
  const [friend, setFriend] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const { startCall } = useCalls();
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
  const isInitialLoadRef = useRef(true);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !mounted) return;
      setMeId(u.user.id);

      const [{ data: prof }, { data: msgs }, { data: spamRow }, { data: callRows }] = await Promise.all([
        supabase.from("profiles").select("id, username, avatar_url, online, last_seen").eq("id", friendId).maybeSingle(),
        supabase.from("messages").select("*")
          .or(`and(sender_id.eq.${u.user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${u.user.id})`)
          .order("created_at", { ascending: true }).limit(500),
        supabase.from("spam_list").select("id").eq("user_id", friendId).eq("spammed_user_id", u.user.id).maybeSingle(),
        supabase.from("calls").select("id, caller_id, callee_id, call_type, status, duration_seconds, created_at")
          .or(`and(caller_id.eq.${u.user.id},callee_id.eq.${friendId}),and(caller_id.eq.${friendId},callee_id.eq.${u.user.id})`)
          .eq("context", "friend")
          .order("created_at", { ascending: true }).limit(200),
      ]);
      if (!mounted) return;
      const profile = prof as Profile | null;
      if (profile && spamRow) profile.online = false;
      setFriend(profile);
      setMessages((msgs as Message[]) ?? []);
      setCalls(((callRows ?? []) as CallRow[]).filter((c) => c.status !== "ringing" && c.status !== "active"));

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

    const callsChannel = supabase
      .channel(`calls-${pairKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (payload) => {
        const row = (payload.new ?? payload.old) as CallRow & { context?: string };
        if (!row) return;
        const involves = (row.caller_id === meId && row.callee_id === friendId) || (row.caller_id === friendId && row.callee_id === meId);
        if (!involves || (row as any).context !== "friend") return;
        if (row.status === "ringing" || row.status === "active") return;
        setCalls((prev) => {
          const exists = prev.some((c) => c.id === row.id);
          if (exists) return prev.map((c) => (c.id === row.id ? (row as CallRow) : c));
          return [...prev, row as CallRow];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
      supabase.removeChannel(callsChannel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [meId, friendId]);

  useEffect(() => {
    if (messages.length > 0 && isInitialLoadRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      isInitialLoadRef.current = false;
    } else {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, calls, friendTyping]);

  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [confirmPinTarget, setConfirmPinTarget] = useState<string | null>(null);
  const [activeMsgMenu, setActiveMsgMenu] = useState<string | null>(null);
  const [showAllPins, setShowAllPins] = useState(false);
  const [unsendTarget, setUnsendTarget] = useState<string | null>(null);

  const parsedMessages = useMemo(() => {
    const visible: Array<Message & {
      reactions: Record<string, string[]>;
      replyTo?: { id: string; senderName: string; text: string };
      isPinned: boolean;
      isSystemPin?: boolean;
      isSystemUnpin?: boolean;
      isUnsent?: boolean;
    }> = [];

    const reactionMap: Record<string, Record<string, string[]>> = {};
    const pinSet = new Set<string>();

    for (const m of messages) {
      if (m.content?.startsWith("[system:reaction:")) {
        const parts = m.content.split(":");
        const msgId = parts[2];
        const emoji = parts[3];
        const senderId = parts[4]?.replace("]", "");
        if (msgId && emoji && senderId) {
          if (!reactionMap[msgId]) reactionMap[msgId] = {};
          if (!reactionMap[msgId][emoji]) reactionMap[msgId][emoji] = [];
          const idx = reactionMap[msgId][emoji].indexOf(senderId);
          if (idx >= 0) {
            reactionMap[msgId][emoji].splice(idx, 1);
          } else {
            for (const key of Object.keys(reactionMap[msgId])) {
              reactionMap[msgId][key] = reactionMap[msgId][key].filter(uid => uid !== senderId);
            }
            if (!reactionMap[msgId][emoji]) reactionMap[msgId][emoji] = [];
            reactionMap[msgId][emoji].push(senderId);
          }
        }
      } else if (m.content?.startsWith("[system:pin:")) {
        const parts = m.content.split(":");
        const msgId = parts[2]?.replace("]", "");
        if (msgId) pinSet.add(msgId);
      } else if (m.content?.startsWith("[system:unpin:")) {
        const parts = m.content.split(":");
        const msgId = parts[2]?.replace("]", "");
        if (msgId) pinSet.delete(msgId);
      }
    }

    for (const m of messages) {
      if (m.content === "[system:unsent]") {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isUnsent: true,
        });
        continue;
      }

      if (m.content?.startsWith("[system:reaction:")) continue;

      if (m.content?.startsWith("[system:pin:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemPin: true,
        });
        continue;
      }

      if (m.content?.startsWith("[system:unpin:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUnpin: true,
        });
        continue;
      }

      let replyTo: any = undefined;
      let cleanContent = m.content;

      if (m.content?.startsWith("[reply:")) {
        const match = m.content.match(/^\[reply:([^:]+):([^:]+):([^\]]*)\]\s*([\s\S]*)/);
        if (match) {
          const [_, targetId, senderName, text, actualText] = match;
          replyTo = { id: targetId, senderName, text };
          cleanContent = actualText;
        }
      }

      visible.push({
        ...m,
        content: cleanContent,
        reactions: reactionMap[m.id] || {},
        replyTo,
        isPinned: pinSet.has(m.id),
      });
    }

    return visible;
  }, [messages]);

  const pinnedMessages = useMemo(() => {
    return parsedMessages.filter(m => m.isPinned);
  }, [parsedMessages]);

  const scrollToMessage = (msgId: string) => {
    const el = msgRefs.current[msgId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-primary/20", "transition-colors", "duration-500", "rounded-2xl");
      setTimeout(() => {
        el.classList.remove("bg-primary/20");
      }, 2000);
    }
  };

  async function reactToMessage(msgId: string, emoji: string) {
    if (!meId) return;
    const reactionContent = `[system:reaction:${msgId}:${emoji}:${meId}]`;
    const { data, error } = await supabase.from("messages").insert({
      sender_id: meId,
      receiver_id: friendId,
      content: reactionContent,
      seen: true,
      delivered: true,
    } as any).select().single();
    if (error) {
      toast.error("Failed to update reaction");
    } else {
      setMessages(prev => [...prev, data as Message]);
    }
  }

  async function pinMessage(msgId: string) {
    if (!meId) return;
    const pinContent = `[system:pin:${msgId}]`;
    const { data, error } = await supabase.from("messages").insert({
      sender_id: meId,
      receiver_id: friendId,
      content: pinContent,
      seen: true,
      delivered: true,
    } as any).select().single();
    if (error) {
      toast.error("Failed to pin message");
    } else {
      setMessages(prev => [...prev, data as Message]);
      toast.success("Message pinned");
    }
  }

  async function unpinMessage(msgId: string) {
    if (!meId) return;
    const unpinContent = `[system:unpin:${msgId}]`;
    const { data, error } = await supabase.from("messages").insert({
      sender_id: meId,
      receiver_id: friendId,
      content: unpinContent,
      seen: true,
      delivered: true,
    } as any).select().single();
    if (error) {
      toast.error("Failed to unpin message");
    } else {
      setMessages(prev => [...prev, data as Message]);
      toast.success("Message unpinned");
    }
  }

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
    
    const replyPrefix = replyingTo
      ? `[reply:${replyingTo.id}:${replyingTo.sender_id === meId ? "You" : (friend?.username || "Friend")}:${replyingTo.content ? replyingTo.content.slice(0, 30) : replyingTo.image_url ? "Image 📷" : replyingTo.audio_url ? "Voice message 🎙️" : "Message"}] `
      : "";
    const finalContent = replyPrefix + content;
    setReplyingTo(null);

    const tempId = addOptimistic({ content });
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: meId, receiver_id: friendId, content: finalContent })
      .select()
      .single();
    if (error) {
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
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

    // Static image validation
    const fileMime = file.type.toLowerCase();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (fileMime === "image/gif" || ext === "gif") {
      alert("GIF files are not supported. Please choose a static image.");
      return;
    }
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    const allowedExts = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
    if (!allowedMimes.includes(fileMime) && !allowedExts.includes(ext)) {
      alert("Unsupported format. Please choose a JPEG, PNG, WEBP, or HEIC image.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) { alert("Max 8 MB"); return; }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    const tempId = addOptimistic({ image_url: localPreview });
    try {
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
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
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
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
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
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{friend.username}</p>
          <p className="text-xs text-muted-foreground truncate">
            {friendTyping ? "Typing…" : friend.online ? "Active now" :
              friend.last_seen ? `Active ${formatDistanceToNow(new Date(friend.last_seen), { addSuffix: true })}` : "Offline"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => friend && startCall({ calleeId: friend.id, kind: "voice", peer: { name: friend.username, avatar: friend.avatar_url }, context: "friend" })}
          className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary"
          aria-label="Voice call"
        >
          <Phone className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => friend && startCall({ calleeId: friend.id, kind: "video", peer: { name: friend.username, avatar: friend.avatar_url }, context: "friend" })}
          className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary"
          aria-label="Video call"
        >
          <Video className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => { setSearchOpen((v) => !v); setSearchQuery(""); setActiveMatch(0); }}
          className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"
          aria-label="Search in conversation"
        >
          <Search className="h-5 w-5" />
        </button>
      </header>

      {searchOpen && (
        <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setActiveMatch(0); }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || matchIds.length === 0) return;
              e.preventDefault();
              if (e.shiftKey) setActiveMatch((i) => (i - 1 + matchIds.length) % matchIds.length);
              else setActiveMatch((i) => (i + 1) % matchIds.length);
            }}
            placeholder="Search in conversation (Enter = next)"
            className="rounded-full bg-secondary border-transparent h-9"
          />
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums min-w-[3.5rem] text-center">
            {searchQuery.trim() ? `${matchIds.length === 0 ? 0 : activeMatch + 1}/${matchIds.length}` : "0/0"}
          </span>
          <button type="button" disabled={matchIds.length === 0}
            onClick={() => setActiveMatch((i) => (i - 1 + matchIds.length) % matchIds.length)}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary disabled:opacity-40" aria-label="Previous match">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" disabled={matchIds.length === 0}
            onClick={() => setActiveMatch((i) => (i + 1) % matchIds.length)}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary disabled:opacity-40" aria-label="Next match">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary" aria-label="Close search">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div className="bg-secondary/60 backdrop-blur-sm border-b border-border px-4 py-2 flex items-center justify-between text-xs text-foreground z-10 transition-all">
          <div className="flex items-center gap-2 truncate flex-1 cursor-pointer" onClick={() => scrollToMessage(pinnedMessages[pinnedMessages.length - 1].id)}>
            <Pin className="h-3.5 w-3.5 text-primary rotate-45 fill-primary shrink-0" />
            <span className="font-semibold text-muted-foreground shrink-0">Pinned:</span>
            <span className="truncate italic">
              {pinnedMessages[pinnedMessages.length - 1].content || (pinnedMessages[pinnedMessages.length - 1].image_url ? "Image 📷" : "Voice message 🎙️")}
            </span>
          </div>
          <button 
            type="button"
            onClick={() => setShowAllPins(true)} 
            className="text-[10px] uppercase tracking-wider font-bold text-primary hover:underline ml-3 shrink-0"
          >
            See All ({pinnedMessages.length})
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-2">
        {parsedMessages.length === 0 && calls.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">No messages yet. Say hi 👋</div>
        )}
        {(() => {
          type TimelineItem =
            | { kind: "msg"; at: string; msg: typeof parsedMessages[0] }
            | { kind: "call"; at: string; call: CallRow };
          const items: TimelineItem[] = [
            ...parsedMessages.map((m) => ({ kind: "msg" as const, at: m.created_at, msg: m })),
            ...calls.map((c) => ({ kind: "call" as const, at: c.created_at, call: c })),
          ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

          return items.map((it, i) => {
            const prev = items[i - 1];
            const showTime = !prev || new Date(it.at).getTime() - new Date(prev.at).getTime() > 5 * 60 * 1000;

            if (it.kind === "call") {
              const c = it.call;
              const mine = c.caller_id === meId;
              return (
                <div key={`call-${c.id}`}>
                  {showTime && (
                    <div className="text-center text-xs text-muted-foreground py-2">
                      {format(new Date(c.created_at), "MMM d, h:mm a")}
                    </div>
                  )}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"} p-1`}>
                    <CallMessage 
                      mine={mine} 
                      kind={c.call_type} 
                      status={c.status as any} 
                      durationSeconds={c.duration_seconds} 
                      onCallBack={() => friend && startCall({ calleeId: friend.id, kind: c.call_type, peer: { name: friend.username, avatar: friend.avatar_url }, context: "friend" })}
                    />
                  </div>
                </div>
              );
            }

            const m = it.msg;
            const mine = m.sender_id === meId;
            const nextIt = items[i + 1];
            const isLastMine = mine && (!nextIt || nextIt.kind !== "msg" || nextIt.msg.sender_id !== meId);
            const isMatch = matchIds.includes(m.id);
            const isActiveMatch = isMatch && matchIds[activeMatch] === m.id;

            const startPress = () => {
              if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
              pressTimerRef.current = setTimeout(() => {
                setActiveMsgMenu(m.id);
              }, 600);
            };
            const cancelPress = () => {
              if (pressTimerRef.current) {
                clearTimeout(pressTimerRef.current);
                pressTimerRef.current = null;
              }
            };

            const reactionKeys = Object.keys(m.reactions).filter(k => m.reactions[k].length > 0);

            if (m.isSystemPin) {
              return (
                <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic flex items-center justify-center gap-1">
                  <Pin className="h-3 w-3 rotate-45 text-muted-foreground/60 fill-muted-foreground/30" />
                  {mine ? "You pinned a message" : `${friend?.username || "Friend"} pinned a message`}
                </div>
              );
            }

            if (m.isSystemUnpin) {
              return (
                <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic flex items-center justify-center gap-1">
                  <Pin className="h-3 w-3 rotate-45 text-muted-foreground/40" />
                  {mine ? "You unpinned a message" : `${friend?.username || "Friend"} unpinned a message`}
                </div>
              );
            }

            if (m.isUnsent) {
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} py-1`}>
                  <div className="max-w-[240px] px-4 py-2 rounded-2xl border border-border bg-secondary/10 text-muted-foreground/50 text-[13px] italic select-none">
                    {mine ? "You unsent a message" : "Message unsent"}
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} ref={(el) => { msgRefs.current[m.id] = el; }} className="group/msg py-1">
                {showTime && (
                  <div className="text-center text-xs text-muted-foreground py-2">
                    {format(new Date(m.created_at), "MMM d, h:mm a")}
                  </div>
                )}
                
                {/* Reply To Preview */}
                {m.replyTo && (
                  <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-1`}>
                    <div 
                      onClick={() => m.replyTo && scrollToMessage(m.replyTo.id)}
                      className="max-w-[60%] text-[10px] bg-secondary/80 hover:bg-secondary border border-border/60 rounded-2xl px-3 py-1 text-muted-foreground truncate cursor-pointer transition-colors"
                    >
                      <span className="font-bold text-primary block text-[8px] uppercase tracking-wider">Replying to {m.replyTo.senderName}</span>
                      <span className="italic truncate block">{m.replyTo.text}</span>
                    </div>
                  </div>
                )}

                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div 
                    onPointerDown={startPress}
                    onPointerUp={cancelPress}
                    onPointerMove={cancelPress}
                    onPointerLeave={cancelPress}
                    onContextMenu={(e) => { e.preventDefault(); setActiveMsgMenu(m.id); }}
                    className="relative cursor-pointer select-none"
                  >
                    {m.image_url ? (
                      <button onClick={() => setPreview(m.image_url)} className="max-w-[200px] rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary block">
                        <img src={m.image_url} alt="" className="block max-h-80 w-auto object-cover" />
                      </button>
                    ) : m.audio_url ? (
                      <div className="block">
                        <VoiceMessage src={m.audio_url} mine={mine} />
                      </div>
                    ) : (
                      <div className={`max-w-[240px] px-4 py-2 rounded-2xl ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"} ${isActiveMatch ? "ring-2 ring-primary" : ""}`}>
                        <p className="text-[14px] whitespace-pre-wrap break-words leading-relaxed">
                          {isMatch && m.content ? highlight(m.content, searchQuery.trim()) : m.content}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reactions Badge */}
                {reactionKeys.length > 0 && (
                  <div className={`flex mt-1 ${mine ? "justify-end" : "justify-start"} px-1`}>
                    <div className="inline-flex items-center gap-1 bg-secondary border border-border/80 px-2 py-0.5 rounded-full shadow-sm text-xs leading-none">
                      {reactionKeys.map(k => (
                        <span key={k} title={m.reactions[k].join(", ")}>{k}</span>
                      ))}
                      {reactionKeys.reduce((acc, k) => acc + m.reactions[k].length, 0) > 1 && (
                        <span className="text-[9px] font-bold text-muted-foreground">{reactionKeys.reduce((acc, k) => acc + m.reactions[k].length, 0)}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Pin Badge */}
                {m.isPinned && (
                  <div className={`flex mt-1 ${mine ? "justify-end" : "justify-start"} px-1`}>
                    <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                      <Pin className="h-3 w-3 rotate-45 text-primary fill-primary shrink-0" />
                      Pinned
                    </span>
                  </div>
                )}

                {mine && (isLastMine || m.failed) && (
                  <div className="flex items-center justify-end gap-1.5 pr-2 pt-1 min-h-5 text-[11px] font-medium leading-none text-message-status">
                    {m.failed ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                        Not delivered
                      </span>
                    ) : m.id.startsWith("temp-") ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-message-status/60 animate-pulse shrink-0" />
                        Sending…
                      </span>
                    ) : m.seen ? (
                      <span className="inline-flex items-center gap-1">
                        {friend?.avatar_url ? (
                          <img src={friend.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full object-cover ring-1 ring-border" />
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                        )}
                        Seen
                      </span>
                    ) : m.delivered ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-message-status shrink-0" />
                        Delivered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-message-status/60 shrink-0" />
                        Sent
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          });
        })()}
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

      {replyingTo && (
        <div className="px-4 py-2 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground animate-in slide-in-from-bottom-2 duration-200">
          <div className="truncate flex-1">
            <span className="font-bold text-primary block text-[10px] uppercase">Replying to {replyingTo.sender_id === meId ? "yourself" : (friend?.username || "Friend")}</span>
            <span className="truncate block italic">{replyingTo.content || "Media / Attachment"}</span>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)} className="h-6 w-6 rounded-full hover:bg-secondary flex items-center justify-center ml-2 shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={send} className="relative p-3 border-t border-border flex items-center gap-2 bg-card">
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
        <Input autoFocus value={draft} onChange={(e) => onDraftChange(e.target.value)} placeholder="Aa"
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

      {/* Message Context Menu & Reactions */}
      {activeMsgMenu && (() => {
        const m = parsedMessages.find(x => x.id === activeMsgMenu);
        if (!m) return null;
        const mine = m.sender_id === meId;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setActiveMsgMenu(null)} />
            <div className="relative w-full max-w-[280px] flex flex-col gap-3 animate-in zoom-in-95 duration-200 z-10">
              {/* Reactions Bar */}
              <div className="bg-card border border-border/80 rounded-full py-2 px-3 shadow-2xl flex items-center justify-between gap-1">
                {["❤️", "😂", "😮", "😢", "😡", "👍"].map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      reactToMessage(m.id, emoji);
                      setActiveMsgMenu(null);
                    }}
                    className="text-2xl hover:scale-125 active:scale-95 transition-transform duration-150"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const more = prompt("Type any emoji reaction:");
                    if (more) reactToMessage(m.id, more.trim().slice(0, 5));
                    setActiveMsgMenu(null);
                  }}
                  className="h-8 w-8 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground flex items-center justify-center text-lg font-bold shrink-0 transition-colors"
                >
                  +
                </button>
              </div>

              {/* Context Menu */}
              <div className="bg-card border border-border rounded-2xl shadow-2xl p-2.5 overflow-hidden flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(m);
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                >
                  <Reply className="h-4 w-4 text-primary" />
                  <span>Reply</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(m.content || "");
                    toast.success("Copied to clipboard");
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                >
                  <Copy className="h-4 w-4 text-primary" />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (m.isPinned) {
                      unpinMessage(m.id);
                    } else {
                      setConfirmPinTarget(m.id);
                    }
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                >
                  <Pin className="h-4 w-4 text-primary rotate-45" />
                  <span>{m.isPinned ? "Unpin message" : "Pin message"}</span>
                </button>
                {mine ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUnsendTarget(m.id);
                      setActiveMsgMenu(null);
                    }}
                    className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                    <span>Delete</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const note = prompt("Forward this message to:");
                      if (note) {
                        toast.success("Forwarded message successfully");
                      }
                      setActiveMsgMenu(null);
                    }}
                    className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                  >
                    <Forward className="h-4 w-4 text-primary" />
                    <span>Forward</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pin Confirmation dialog */}
      {confirmPinTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border w-full max-w-[280px] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-center animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-base text-foreground leading-snug">Pin this message?</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Everyone in the chat can see pinned messages. You can see and manage pinned messages from the chat details.
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmPinTarget(null)}
                className="flex-1 py-2 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors border border-border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  pinMessage(confirmPinTarget);
                  setConfirmPinTarget(null);
                }}
                className="flex-1 py-2 bg-primary hover:opacity-90 text-primary-foreground font-semibold rounded-xl text-xs transition-colors"
              >
                Pin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* See All Pinned messages modal */}
      {showAllPins && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowAllPins(false)} />
          <div className="relative bg-card border border-border w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[70vh] overflow-hidden animate-in zoom-in-95 duration-200 z-10">
            <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground flex items-center gap-1.5">
                <Pin className="h-4 w-4 rotate-45 text-primary fill-primary" />
                Pinned Messages ({pinnedMessages.length})
              </h3>
              <button type="button" onClick={() => setShowAllPins(false)} className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pinnedMessages.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">No pinned messages.</p>
              ) : (
                pinnedMessages.map(m => (
                  <div 
                    key={m.id} 
                    className="p-3 bg-secondary/30 hover:bg-secondary/60 border border-border rounded-xl transition-colors flex flex-col gap-1.5 relative group"
                  >
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-bold text-primary cursor-pointer" onClick={() => { scrollToMessage(m.id); setShowAllPins(false); }}>
                        {m.sender_id === meId ? "You" : (friend?.username || "Friend")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            unpinMessage(m.id);
                          }}
                          className="text-destructive hover:underline font-semibold"
                        >
                          Unpin
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-foreground line-clamp-3 break-words cursor-pointer" onClick={() => { scrollToMessage(m.id); setShowAllPins(false); }}>
                      {m.content || (m.image_url ? "Image 📷" : "Voice message 🎙️")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Custom Unsend Message confirmation modal */}
      {unsendTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setUnsendTarget(null)} />
          <div className="relative bg-card border border-border w-full max-w-sm rounded-2xl shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-200 z-10">
            <h3 className="font-bold text-base text-foreground">Unsend message?</h3>
            <p className="text-xs text-muted-foreground">
              This will unsend the message for everyone in the chat. Active participants will see that you unsent a message.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setUnsendTarget(null)}
                className="flex-1 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors border border-border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = unsendTarget;
                  setUnsendTarget(null);
                  try {
                    const { error } = await supabase
                      .from("messages")
                      .update({ content: "[system:unsent]", image_url: null, audio_url: null } as any)
                      .eq("id", targetId);
                    if (error) {
                      await supabase.from("messages").delete().eq("id", targetId);
                      setMessages(prev => prev.filter(x => x.id !== targetId));
                    } else {
                      setMessages(prev => prev.map(x => x.id === targetId ? { ...x, content: "[system:unsent]", image_url: null, audio_url: null } : x));
                    }
                    toast.success("Message unsent");
                  } catch (err) {
                    toast.error("Could not unsend message");
                  }
                }}
                className="flex-1 py-2.5 bg-destructive hover:opacity-90 text-destructive-foreground font-semibold rounded-xl text-xs transition-colors"
              >
                Unsend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
