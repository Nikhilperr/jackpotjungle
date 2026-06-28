import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, ArrowLeft, ImageIcon, Loader2, X, Phone, Video, Pin, Reply, Info, Bell, Search, ChevronUp, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { VoiceMessage } from "@/components/messenger/VoiceMessage";
import { CallMessage } from "@/components/messenger/CallMessage";
import { useCalls } from "@/components/messenger/CallProvider";
import { uploadAndSign } from "@/lib/chat-media";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: "voice" | "video";
  status: "ringing" | "active" | "ended" | "missed" | "declined" | "canceled";
  duration_seconds: number;
  created_at: string;
};

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
  failed?: boolean;
};

function PageChatView() {
  const [meId, setMeId] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recUploading, setRecUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const { startCall } = useCalls();
  const [deletedForMeIds, setDeletedForMeIds] = useState<Set<string>>(new Set());
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    const list = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
    setDeletedForMeIds(new Set(list));
  }, []);

  const parsedMessages = useMemo(() => {
    const visible: Array<Msg & {
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
      if (deletedForMeIds.has(m.id)) continue;
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
      if (deletedForMeIds.has(m.id)) continue;
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
  }, [messages, deletedForMeIds]);

  const pinnedMessages = useMemo(() => {
    return parsedMessages.filter(m => m.isPinned);
  }, [parsedMessages]);

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

      // Ring the active page inbox first, instead of a random/offline admin.
      const { data: adminRows } = await supabase.from("user_roles")
        .select("user_id").in("role", ["super_admin", "admin"]);
      const adminIds = [...new Set((adminRows ?? []).map((r) => r.user_id))];
      if (adminIds.length > 0) {
        const { data: admins } = await supabase.from("profiles")
          .select("id, online, last_seen")
          .in("id", adminIds)
          .order("online", { ascending: false })
          .order("last_seen", { ascending: false });
        if (mounted && admins?.[0]) setAdminId(admins[0].id);
      }

      // Load call history for this page conversation
      const { data: callRows } = await supabase.from("calls")
        .select("id, caller_id, callee_id, call_type, status, duration_seconds, created_at")
        .eq("context", "page").eq("page_conversation_id", conv.id)
        .order("created_at", { ascending: true }).limit(200);
      if (mounted) setCalls(((callRows ?? []) as CallRow[]).filter((c) => c.status !== "ringing" && c.status !== "active"));

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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "page_messages", filter: `conversation_id=eq.${convId}` }, (payload) => {
        const m = payload.new as Msg;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "page_messages", filter: `conversation_id=eq.${convId}` }, (payload) => {
        const oldId = (payload.old as { id?: string })?.id;
        if (!oldId) return;
        setMessages((prev) => prev.filter((x) => x.id !== oldId));
      })
      .subscribe();

    const callsCh = supabase
      .channel(`user-page-calls-${convId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `page_conversation_id=eq.${convId}` }, (payload) => {
        const row = (payload.new ?? payload.old) as CallRow;
        if (!row || row.status === "ringing" || row.status === "active") return;
        setCalls((prev) => {
          const exists = prev.some((c) => c.id === row.id);
          if (exists) return prev.map((c) => (c.id === row.id ? row : c));
          return [...prev, row];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); supabase.removeChannel(callsCh); };
  }, [convId]);

  useEffect(() => {
    if (messages.length > 0 && isInitialLoadRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      isInitialLoadRef.current = false;
    } else {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, calls]);

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
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
      console.error(error);
      return;
    }
    if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Msg) : x)));
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !meId || !convId) return;

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
        .from("page_messages")
        .insert({ conversation_id: convId, sender_id: meId, from_page: false, content: null, image_url: url } as any)
        .select()
        .single();
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Msg) : x)));
      else setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, image_url: url } : x)));
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
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
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
    }
    setRecUploading(false);
  }

  return (
    <div className="h-full flex-1 flex min-h-0 relative">
      <div className="flex-1 flex flex-col min-h-0 bg-background">
        <header className="px-3 md:px-5 py-3 border-b border-border flex items-center gap-3 bg-card">
          <Link to="/chat" className="md:hidden h-9 w-9 -ml-1 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="flex-1 min-w-0 flex items-center gap-3 -mx-1 px-1 py-1 rounded-lg hover:bg-secondary text-left"
            aria-label="Toggle details"
          >
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">Jackpot Jungle</p>
              <p className="text-xs text-muted-foreground truncate">Official page · We usually reply within a few hours</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => startCall({ calleeId: null, kind: "voice", peer: { name: "Jackpot Jungle", avatar: null }, context: "page_broadcast", pageConversationId: convId })}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-40"
            aria-label="Voice call"
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => startCall({ calleeId: null, kind: "video", peer: { name: "Jackpot Jungle", avatar: null }, context: "page_broadcast", pageConversationId: convId })}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-40"
            aria-label="Video call"
          >
            <Video className="h-5 w-5" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
          {messages.length === 0 && calls.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              Welcome to Jackpot Jungle 👋 Send us a message — an admin will reply soon.
            </div>
          )}
          {(() => {
            type T = { kind: "msg"; at: string; msg: Msg } | { kind: "call"; at: string; call: CallRow };
            const items: T[] = [
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
                    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <CallMessage mine={mine} kind={c.call_type} status={c.status as any} durationSeconds={c.duration_seconds} />
                    </div>
                  </div>
                );
              }
              const m = it.msg;
              const mine = !m.from_page;
              const nextIt = items[i + 1];
              const isLastMine = mine && (!nextIt || nextIt.kind !== "msg" || nextIt.msg.from_page);
              const reactionKeys = Object.keys(m.reactions || {}).filter(k => m.reactions[k].length > 0);

              if (m.isSystemPin) {
                return (
                  <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic flex items-center justify-center gap-1">
                    <Pin className="h-3 w-3 rotate-45 text-muted-foreground/60 fill-muted-foreground/30" />
                    {mine ? "You pinned a message" : "Jackpot Jungle pinned a message"}
                  </div>
                );
              }

              if (m.isSystemUnpin) {
                return (
                  <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic flex items-center justify-center gap-1">
                    <Pin className="h-3 w-3 rotate-45 text-muted-foreground/40" />
                    {mine ? "You unpinned a message" : "Jackpot Jungle unpinned a message"}
                  </div>
                );
              }

              if (m.isUnsent) {
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} py-1`}>
                    <div className="max-w-[240px] px-4 py-2 rounded-2xl border border-border bg-secondary/10 text-muted-foreground/50 text-[13px] italic select-none">
                      {mine ? "You unsent a message" : "This message was unsent"}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id}>
                  {showTime && (
                    <div className="text-center text-xs text-muted-foreground py-2">
                      {format(new Date(m.created_at), "MMM d, h:mm a")}
                    </div>
                  )}
                  
                  {/* Reply To Preview */}
                  {m.replyTo && (
                    <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-1`}>
                      <div className="max-w-[70%] flex items-center gap-1.5 px-3 py-1 bg-secondary/40 border border-border/40 rounded-xl text-xs text-muted-foreground select-none">
                        <Reply className="h-3 w-3 shrink-0" />
                        <span className="font-semibold">{m.replyTo.senderName}</span>
                        <span className="truncate max-w-[120px]">{m.replyTo.text}</span>
                      </div>
                    </div>
                  )}

                  <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      {m.image_url ? (
                        <button onClick={() => setPreview(m.image_url)} className="max-w-[70%] rounded-3xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary">
                          <img src={m.image_url} alt="" className="block max-h-80 w-auto object-cover" />
                        </button>
                      ) : m.audio_url ? (
                        <VoiceMessage src={m.audio_url} mine={mine} />
                      ) : (
                        <div className={`max-w-[70%] px-4 py-2 rounded-3xl ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"}`}>
                          <p className="text-[15px] whitespace-pre-wrap break-words">{m.content}</p>
                        </div>
                      )}
                    </div>

                    {/* Reactions */}
                    {reactionKeys.length > 0 && (
                      <div className={`flex gap-1 mt-1 ${mine ? "justify-end" : "justify-start"}`}>
                        {reactionKeys.map(emoji => (
                          <div key={emoji} className="flex items-center gap-1 bg-secondary border border-border px-1.5 py-0.5 rounded-full text-xs shadow-sm">
                            <span>{emoji}</span>
                            <span className="text-[10px] text-muted-foreground font-semibold">{m.reactions[emoji].length}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {mine && (isLastMine || m.failed) && (
                    <div className="flex items-center justify-end gap-1.5 pr-2 pt-1 min-h-5 text-[11px] font-medium leading-none text-message-status">
                      {m.failed ? (
                        <span className="inline-flex items-center gap-1 text-destructive"><span className="h-2 w-2 rounded-full bg-destructive shrink-0" />Not delivered</span>
                      ) : m.id.startsWith("temp-") ? (
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-message-status/60 animate-pulse shrink-0" />Sending…</span>
                      ) : m.seen ? (
                        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />Seen</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-message-status/60 shrink-0" />Delivered</span>
                      )}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>

        <form onSubmit={send} className="relative p-3 border-t border-border flex items-center gap-2 bg-card">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50" aria-label="Send image">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
          <VoiceRecorder onRecorded={onVoice} uploading={recUploading} />
          <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message Jackpot Jungle"
            className="rounded-full bg-secondary border-transparent" />
          <Button type="submit" size="icon" disabled={!draft.trim() || sending} className="rounded-full shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* Desktop Detail Sidebar */}
      {showDetail && (
        <aside className="w-80 border-l border-border bg-card hidden lg:flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200 shrink-0">
          <ConversationDetailPanel username="Jackpot Jungle" avatar={null} isPage={true} pinnedMessages={pinnedMessages} onClose={() => setShowDetail(false)} />
        </aside>
      )}

      {/* Mobile/Tablet Detail Sheet */}
      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 lg:hidden bg-card border-l border-border text-foreground">
          <ConversationDetailPanel username="Jackpot Jungle" avatar={null} isPage={true} pinnedMessages={pinnedMessages} onClose={() => setShowDetail(false)} />
        </SheetContent>
      </Sheet>

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

export function ConversationDetailPanel({ username, avatar, isPage = false, pinnedMessages = [], onClose }: { username: string; avatar: string | null; isPage?: boolean; pinnedMessages?: any[]; onClose?: () => void }) {
  const [notif, setNotif] = useState(true);
  
  return (
    <div className="h-full flex flex-col bg-card select-none">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0 bg-card">
        {onClose && (
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={onClose}>
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Button>
        )}
        <span className="font-bold text-sm">Details</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="flex flex-col items-center text-center">
          {isPage ? (
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center shrink-0 mb-3 shadow-md">
              <Sparkles className="h-10 w-10 text-primary-foreground" />
            </div>
          ) : (
            <div className="mb-3">
              <Avatar name={username} url={avatar} size={80} />
            </div>
          )}
          <p className="font-bold text-lg">{username}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{isPage ? "Official page" : "Active now"}</p>
        </div>

        {/* Options */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold px-2 mb-2">Options</p>
          <button
            onClick={() => setNotif(v => !v)}
            className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-secondary/60 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                <Bell className="h-4 w-4 text-foreground" />
              </div>
              <span className="text-sm font-medium">Mute Notifications</span>
            </div>
            <div className={`w-8 h-4 rounded-full transition-colors ${notif ? "bg-primary" : "bg-muted-foreground/30"} p-0.5 flex items-center ${notif ? "justify-end" : "justify-start"}`}>
              <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </div>
          </button>
        </div>

        {/* Pinned Messages */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold px-2">Pinned Messages</p>
          {pinnedMessages.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-2">No pinned messages in this chat.</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {pinnedMessages.map((m) => (
                <div key={m.id} className="p-3 bg-secondary/30 border border-border/50 rounded-2xl text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground">
                    {m.from_page ? "Jackpot Jungle" : "You"}
                  </p>
                  <p className="truncate text-foreground">{m.content || "Image / media 📷"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
