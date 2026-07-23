import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toCDNUrl } from "@/config";
import { CachedImage } from "@/components/messenger/CachedImage";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft, Loader2, X, Phone, Video, Pin, Reply, Info, Bell, Search, ChevronUp, ChevronDown, Trash2, Forward, Copy, MoreHorizontal, Edit } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { MessengerComposer } from "@/components/messenger/MessengerComposer";
import { VoiceMessage } from "@/components/messenger/VoiceMessage";
import { CallMessage } from "@/components/messenger/CallMessage";
import { useCalls } from "@/components/messenger/CallProvider";
import { uploadAndSign } from "@/lib/chat-media";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { unsendPageMessagesServer } from "@/lib/messages.functions";
import { Avatar } from "@/components/messenger/Avatar";
import { getCachedPageMessages, setCachedPageMessages } from "@/lib/chat-cache";
import { NetworkManager, generateUUID } from "@/lib/network-manager";
import { attachPageMessagesLive, mergeIncomingPageMessage } from "@/lib/live-page-messages";

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: "voice" | "video";
  status: "ringing" | "active" | "ended" | "missed" | "declined" | "canceled";
  duration_seconds: number;
  created_at: string;
};

export const Route = createFileRoute("/app/_authenticated/chat/page")({
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
  queued?: boolean;
};

function PageChatView() {
  const [meId, setMeId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("jj_me_id");
  });
  const [convId, setConvId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const myId = localStorage.getItem("jj_me_id");
    return myId ? localStorage.getItem(`jj_page_conv_id_${myId}`) : null;
  });
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const myId = localStorage.getItem("jj_me_id");
      if (myId) {
        const cachedConvId = localStorage.getItem(`jj_page_conv_id_${myId}`);
        if (cachedConvId) {
          const cached = getCachedPageMessages(`page-chat-${cachedConvId}`);
          return cached || [];
        }
      }
    } catch {}
    return [];
  });
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
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const isNearBottomRef = useRef(true);
  const { startCall } = useCalls();
  const [deletedForMeIds, setDeletedForMeIds] = useState<Set<string>>(new Set());
  const [showDetail, setShowDetail] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // One-time mobile check — avoid resize listener (keyboard triggers it on Android)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMobile(window.innerWidth < 768);
  }, []);

  const [forwardTargetMsg, setForwardTargetMsg] = useState<Msg | null>(null);
  const [forwardCandidates, setForwardCandidates] = useState<Array<{ id: string; name: string; avatar: string | null; type: "friend" | "page" }>>([]);
  const [forwardingTargetId, setForwardingTargetId] = useState<string | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");

  useEffect(() => {
    if (!forwardTargetMsg || !meId) return;
    (async () => {
      const { data: fr } = await supabase.from("friendships").select("user_a, user_b");
      const fids = (fr ?? []).map((f) => (f.user_a === meId ? f.user_b : f.user_a));
      let list: Array<{ id: string; name: string; avatar: string | null; type: "friend" | "page" }> = [];
      
      list.push({ id: "support-page", name: "Jackpot Jungle Support", avatar: null, type: "page" });

      if (fids.length > 0) {
        const { data: fprofs } = (await supabase
          .from("profiles")
          .select("id, username, avatar_url, first_name, last_name" as any)
          .in("id", fids)) as { data: any[] | null; error: any };
        
        (fprofs ?? []).forEach((p) => {
          const displayName = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.username;
          list.push({ id: p.id, name: displayName, avatar: p.avatar_url, type: "friend" });
        });
      }
      setForwardCandidates(list);
    })();
  }, [forwardTargetMsg, meId]);

  async function executeForward(target: typeof forwardCandidates[0]) {
    if (!forwardTargetMsg || !meId) return;
    setForwardingTargetId(target.id);
    try {
      const contentPrefix = "[system:forwarded] ";
      let newContent = forwardTargetMsg.content;
      if (newContent) {
        if (!newContent.startsWith("[system:forwarded]")) {
          newContent = contentPrefix + newContent;
        }
      } else {
        newContent = "[system:forwarded]";
      }

      if (target.type === "page") {
        let { data: conv } = await supabase.from("page_conversations").select("id").eq("user_id", meId).maybeSingle();
        if (!conv) {
          const ins = await supabase.from("page_conversations").insert({ user_id: meId }).select("id").single();
          conv = ins.data;
        }
        if (!conv) throw new Error("Could not find or create support conversation");

        const { error } = await supabase.from("page_messages").insert({
          conversation_id: conv.id,
          sender_id: meId,
          from_page: false,
          content: newContent,
          image_url: forwardTargetMsg.image_url,
          audio_url: forwardTargetMsg.audio_url
        } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("messages").insert({
          sender_id: meId,
          receiver_id: target.id,
          content: newContent,
          image_url: forwardTargetMsg.image_url,
          audio_url: forwardTargetMsg.audio_url
        } as any);
        if (error) throw error;
      }
      toast.success(`Message forwarded to ${target.name}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to forward message");
    } finally {
      setForwardingTargetId(null);
      setForwardTargetMsg(null);
    }
  }

  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [confirmPinTarget, setConfirmPinTarget] = useState<string | null>(null);
  const [activeMsgMenu, setActiveMsgMenu] = useState<string | null>(null);
  const [showAllPins, setShowAllPins] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set());
  const [showDeleteBottomSheet, setShowDeleteBottomSheet] = useState(false);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pressTimerRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const jumpToMessage = (id: string) => {
    const el = msgRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-primary/20");
      setTimeout(() => {
        el.classList.remove("bg-primary/20");
      }, 2000);
    } else {
      toast.error("Message not found in history");
    }
  };

  const deleteForMe = (ids: string[]) => {
    try {
      const nextList = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
      const nextSet = new Set<string>([...(Array.isArray(nextList) ? nextList : []), ...ids]);
      localStorage.setItem("jj_deleted_messages", JSON.stringify(Array.from(nextSet)));
      setDeletedForMeIds(nextSet);
    } catch {
      const nextSet = new Set<string>(ids);
      localStorage.setItem("jj_deleted_messages", JSON.stringify(ids));
      setDeletedForMeIds(nextSet);
    }
  };

  const parsedMessages = useMemo(() => {
    const visible: Array<Msg & {
      reactions: Record<string, string[]>;
      replyTo?: { id: string; senderName: string; text: string };
      isPinned: boolean;
      isSystemPin?: boolean;
      isSystemUnpin?: boolean;
      isUnsent?: boolean;
      isForwarded?: boolean;
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
      let isForwarded = false;

      if (cleanContent?.startsWith("[system:forwarded] ")) {
        isForwarded = true;
        cleanContent = cleanContent.slice("[system:forwarded] ".length);
      } else if (cleanContent?.startsWith("[system:forwarded]")) {
        isForwarded = true;
        cleanContent = cleanContent.slice("[system:forwarded]".length).trim() || null;
      } else if (cleanContent === "[system:forwarded]") {
        isForwarded = true;
        cleanContent = null;
      }

      if (cleanContent?.startsWith("[reply:")) {
        const match = cleanContent.match(/^\[reply:([^:]+):([^:]+):([^\]]*)\]\s*([\s\S]*)/);
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
        isForwarded,
      });
    }

    return visible;
  }, [messages, deletedForMeIds]);

  const allSelectedAreMine = useMemo(() => {
    if (selectedMsgs.size === 0) return false;
    for (const id of selectedMsgs) {
      const msg = parsedMessages.find(x => x.id === id);
      if (!msg || msg.from_page) return false;
    }
    return true;
  }, [selectedMsgs, parsedMessages]);

  async function reactToMessage(msgId: string, emoji: string) {
    if (!meId || !convId) return;
    const reactionContent = `[system:reaction:${msgId}:${emoji}:${meId}]`;
    const { data, error } = await supabase.from("page_messages").insert({
      conversation_id: convId,
      sender_id: meId,
      from_page: false,
      content: reactionContent,
      seen: true,
    } as any).select().single();
    if (error) {
      toast.error("Failed to update reaction");
    } else {
      setMessages(prev => [...prev, data as Msg]);
    }
  }

  async function pinMessage(msgId: string) {
    if (!meId || !convId) return;
    const pinContent = `[system:pin:${msgId}]`;
    const { data, error } = await supabase.from("page_messages").insert({
      conversation_id: convId,
      sender_id: meId,
      from_page: false,
      content: pinContent,
      seen: true,
    } as any).select().single();
    if (error) {
      toast.error("Failed to pin message");
    } else {
      setMessages(prev => [...prev, data as Msg]);
      toast.success("Message pinned");
    }
  }

  async function unpinMessage(msgId: string) {
    if (!meId || !convId) return;
    const unpinContent = `[system:unpin:${msgId}]`;
    const { data, error } = await supabase.from("page_messages").insert({
      conversation_id: convId,
      sender_id: meId,
      from_page: false,
      content: unpinContent,
      seen: true,
    } as any).select().single();
    if (error) {
      toast.error("Failed to unpin message");
    } else {
      setMessages(prev => [...prev, data as Msg]);
      toast.success("Message unpinned");
    }
  }

  const handleSelect = useCallback((id: string) => {
    setSelectedMsgs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleReact = useCallback((id: string, emoji: string) => {
    reactToMessage(id, emoji);
  }, [meId, convId]);

  const handlePin = useCallback((id: string) => {
    setConfirmPinTarget(id);
  }, []);

  const handleUnpin = useCallback((id: string) => {
    unpinMessage(id);
  }, [meId, convId]);

  const handleReply = useCallback((m: any) => {
    setReplyingTo(m);
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text || "");
    toast.success("Copied to clipboard");
  }, []);

  const handleDelete = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedMsgs(new Set([id]));
  }, []);

  const handleForward = useCallback((m: any) => {
    setForwardTargetMsg(m);
  }, []);

  const handlePreviewImage = useCallback((url: string) => {
    setPreview(url);
  }, []);

  const handleMenuOpen = useCallback((id: string) => {
    setActiveMsgMenu(id);
  }, []);

  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
      setDeletedForMeIds(new Set(Array.isArray(list) ? list : []));
    } catch {
      setDeletedForMeIds(new Set());
    }
  }, []);

  const pinnedMessages = useMemo(() => {
    return parsedMessages.filter(m => m.isPinned);
  }, [parsedMessages]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !mounted) return;
      setMeId(u.user.id);

      // ── Step 1: Show cached data INSTANTLY ──────────────────────────────
      const cachedConvId = typeof window !== "undefined" ? localStorage.getItem(`jj_page_conv_id_${u.user.id}`) : null;
      if (cachedConvId) {
        setConvId(cachedConvId);
        const cached = getCachedPageMessages(`page-chat-${cachedConvId}`);
        if (cached) setMessages(cached);
      }

      let { data: conv } = await supabase.from("page_conversations").select("id").eq("user_id", u.user.id).maybeSingle();
      if (!conv) {
        const ins = await supabase.from("page_conversations").insert({ user_id: u.user.id }).select("id").single();
        conv = ins.data;
      }
      if (!conv || !mounted) return;
      setConvId(conv.id);
      if (typeof window !== "undefined") {
        localStorage.setItem(`jj_page_conv_id_${u.user.id}`, conv.id);
      }

      const cacheKey = `page-chat-${conv.id}`;
      const cached = getCachedPageMessages(cacheKey);
      if (cached) setMessages(cached);

      // ── Step 2: Fetch fresh data/delta in background ─────────────────────
      const lastCachedMsg = cached && cached.length > 0 ? cached[cached.length - 1] : null;

      if (lastCachedMsg) {
        const { data: deltaMsgs } = await supabase.from("page_messages")
          .select("id, sender_id, from_page, content, image_url, audio_url, seen, created_at")
          .eq("conversation_id", conv.id)
          .gt("created_at", lastCachedMsg.created_at)
          .order("created_at", { ascending: true });
        if (mounted) {
          const delta = (deltaMsgs ?? []) as Msg[];
          const combined = [...(cached || [])];
          delta.forEach((m) => {
            if (!combined.some((x) => x.id === m.id)) {
              combined.push(m);
            }
          });
          setMessages(combined);
          setCachedPageMessages(cacheKey, combined);
        }
      } else {
        const { data: msgs } = await supabase.from("page_messages")
          .select("id, sender_id, from_page, content, image_url, audio_url, seen, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (mounted) {
          const fresh = (msgs as Msg[]) ?? [];
          const reversed = [...fresh].reverse();
          setMessages(reversed);
          setCachedPageMessages(cacheKey, reversed);
        }
      }

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
    if (messages.length > 0 && convId) {
      setCachedPageMessages(`page-chat-${convId}`, messages);
    }
  }, [messages, convId]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!convId) return;

    const disposeLive = attachPageMessagesLive({
      conversationId: convId,
      channelPrefix: "user-page",
      getLatestCreatedAt: () => {
        const list = messagesRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const id = list[i]?.id;
          if (id && typeof id === "string" && !id.startsWith("temp-")) {
            return list[i].created_at;
          }
        }
        return null;
      },
      onInsert: (m) => {
        setMessages((prev) => mergeIncomingPageMessage(prev, m as Msg));
        if (m.from_page) {
          void supabase.from("page_messages").update({ seen: true }).eq("id", m.id);
        }
      },
      onUpdate: (m) => {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      },
      onDelete: (id) => {
        setMessages((prev) => prev.filter((x) => x.id !== id));
      },
      pollMs: 2000,
    });

    const rand = Math.random().toString(36).slice(2, 9);
    const callsCh = supabase
      .channel(`user-page-calls-${convId}-${rand}`)
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

    return () => {
      disposeLive();
      supabase.removeChannel(callsCh);
    };
  }, [convId]);

  useEffect(() => {
    if (messages.length > 0 && isInitialLoadRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      isInitialLoadRef.current = false;
    } else {
      const lastMsg = messages[messages.length - 1];
      const isMine = lastMsg && !lastMsg.from_page;
      if (isMine || isNearBottomRef.current) {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        setShowScrollToBottom(false);
      } else {
        setShowScrollToBottom(true);
      }
    }
  }, [messages, calls]);



  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  useEffect(() => {
    if (convId && messages.length > 0) {
      const persistent = messages.filter(m => m.id && typeof m.id === "string" && !m.id.startsWith("temp-") && !m.failed);
      if (persistent.length > 0) {
        setCachedPageMessages(`page-chat-${convId}`, persistent);
      }
    }
  }, [messages, convId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isNear = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    isNearBottomRef.current = isNear;
    if (isNear && showScrollToBottom) {
      setShowScrollToBottom(false);
    }
  };

  const getOfflineQueuedForCurrent = useCallback(() => {
    if (!convId) return [];
    return NetworkManager.getMessageQueue()
      .filter((q) => q.is_page && q.conversation_id === convId)
      .map((q) => ({
        id: q.id,
        sender_id: q.sender_id,
        from_page: false,
        content: q.content,
        image_url: q.image_url,
        audio_url: q.audio_url,
        seen: false,
        created_at: q.created_at,
        failed: q.failed ?? false,
        queued: true,
      }));
  }, [convId]);

  useEffect(() => {
    const handleQueueChange = () => {
      const queued = getOfflineQueuedForCurrent();
      setMessages((prev) => {
        const withoutQueued = prev.filter((m) => !queued.some((q) => q.id === m.id));
        return [...withoutQueued, ...queued];
      });
    };

    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { id, finalImageUrl, finalAudioUrl } = customEvent.detail;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === id
            ? {
                ...msg,
                queued: false,
                failed: false,
                image_url: finalImageUrl || msg.image_url,
                audio_url: finalAudioUrl || msg.audio_url
              }
            : msg
        )
      );
    };

    window.addEventListener("jj-queue-updated", handleQueueChange);
    window.addEventListener("jj-queue-processed", handleQueueChange);
    window.addEventListener("jj-message-synchronized", handleSync);
    
    // Initial run to capture any queued offline messages when component mounts
    handleQueueChange();

    return () => {
      window.removeEventListener("jj-queue-updated", handleQueueChange);
      window.removeEventListener("jj-queue-processed", handleQueueChange);
      window.removeEventListener("jj-message-synchronized", handleSync);
    };
  }, [getOfflineQueuedForCurrent]);

  function addOptimistic(partial: Partial<Msg>, customId?: string): string {
    const tempId = customId || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  async function send(e?: React.FormEvent, overrideContent?: string) {
    e?.preventDefault();
    const content = (overrideContent ?? draft).trim();
    if (!content || !meId || !convId) return;
    setDraft("");

    if (editingMessageId) {
      const msgId = editingMessageId;
      setEditingMessageId(null);
      const { data, error } = await supabase
        .from("page_messages")
        .update({ content, is_edited: true })
        .eq("id", msgId)
        .select()
        .single();
      if (error) {
        toast.error("Failed to edit message");
        console.error(error);
        return;
      }
      if (data) {
        setMessages((prev) => prev.map((x) => (x.id === msgId ? (data as Msg) : x)));
      }
      return;
    }

    const finalContent = replyingTo
      ? `[reply:${replyingTo.id}:${replyingTo.from_page ? "Jackpot Jungle" : "You"}:${replyingTo.content ? replyingTo.content.slice(0, 30) : replyingTo.image_url ? "Image 📷" : replyingTo.audio_url ? "Voice message 🎙️" : "Message"}] ${content}`
      : content;
    setReplyingTo(null);

    const clientUuid = generateUUID();
    const tempId = addOptimistic({ content: finalContent }, clientUuid);

    if (!NetworkManager.isOnline()) {
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: null,
        group_id: null,
        content: finalContent,
        image_url: null,
        audio_url: null,
        is_page: true,
        conversation_id: convId,
        reply_to: replyingTo
      });
      return;
    }

    const { data, error } = await supabase
      .from("page_messages")
      .insert({
        id: clientUuid,
        conversation_id: convId,
        sender_id: meId,
        from_page: false,
        content: finalContent
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return;
      }
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: null,
        group_id: null,
        content: finalContent,
        image_url: null,
        audio_url: null,
        is_page: true,
        conversation_id: convId,
        reply_to: replyingTo
      });
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
      console.error(error);
      return;
    }
    if (data) {
      setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Msg) : x)));
      window.dispatchEvent(
        new CustomEvent("jj-message-sent", {
          detail: {
            isPage: true,
            conversationId: convId,
            content: finalContent,
            image_url: null,
            audio_url: null,
            created_at: data.created_at ?? new Date().toISOString(),
          },
        }),
      );
    }
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
    const clientUuid = generateUUID();
    const tempId = addOptimistic({ image_url: localPreview }, clientUuid);

    if (!NetworkManager.isOnline()) {
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: null,
        group_id: null,
        content: null,
        image_url: localPreview,
        audio_url: null,
        is_page: true,
        conversation_id: convId,
        fileExt: ext,
        fileMime: fileMime
      }, file);
      setUploading(false);
      return;
    }

    try {
      const url = await uploadAndSign("chat-images", meId, file, ext, file.type);
      const { data, error } = await supabase
        .from("page_messages")
        .insert({ id: clientUuid, conversation_id: convId, sender_id: meId, from_page: false, content: null, image_url: url } as any)
        .select()
        .single();
      if (error) throw error;
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Msg) : x)));
      else setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, image_url: url } : x)));
    } catch (err: any) {
      console.error(err);
      if (err?.code !== "23505") {
        await NetworkManager.queueMessage({
          id: clientUuid,
          sender_id: meId,
          receiver_id: null,
          group_id: null,
          content: null,
          image_url: localPreview,
          audio_url: null,
          is_page: true,
          conversation_id: convId,
          fileExt: ext,
          fileMime: fileMime
        }, file);
        setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true, image_url: localPreview } : x)));
      }
    }
    setUploading(false);
  }

  async function onVoice(blob: Blob, mime: string, ext: string) {
    if (!meId || !convId) return;
    setRecUploading(true);
    const localPreview = URL.createObjectURL(blob);
    const clientUuid = generateUUID();
    const tempId = addOptimistic({ audio_url: localPreview }, clientUuid);

    if (!NetworkManager.isOnline()) {
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: null,
        group_id: null,
        content: null,
        image_url: null,
        audio_url: localPreview,
        is_page: true,
        conversation_id: convId,
        fileExt: ext,
        fileMime: mime
      }, blob);
      setRecUploading(false);
      return;
    }

    try {
      const url = await uploadAndSign("chat-audio", meId, blob, ext, mime);
      const { data, error } = await supabase
        .from("page_messages")
        .insert({ id: clientUuid, conversation_id: convId, sender_id: meId, from_page: false, content: null, audio_url: url } as any)
        .select()
        .single();
      if (error) throw error;
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Msg) : x)));
      else setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, audio_url: url } : x)));
    } catch (err: any) {
      console.error(err);
      if (err?.code !== "23505") {
        await NetworkManager.queueMessage({
          id: clientUuid,
          sender_id: meId,
          receiver_id: null,
          group_id: null,
          content: null,
          image_url: null,
          audio_url: localPreview,
          is_page: true,
          conversation_id: convId,
          fileExt: ext,
          fileMime: mime
        }, blob);
        setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true, audio_url: localPreview } : x)));
      }
    }
    setRecUploading(false);
  }

  return (
    <div className="h-full flex-1 flex min-h-0 relative w-full overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 bg-background w-full overflow-hidden">
        {selectionMode ? (
          <header className="sticky top-0 z-30 px-3 md:px-5 py-3 border-b border-border flex items-center justify-between bg-card min-h-[65px] shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectionMode(false);
                setSelectedMsgs(new Set());
              }}
              className="text-primary hover:opacity-80 font-semibold text-sm"
            >
              Cancel
            </button>
            <span className="font-semibold text-foreground text-sm">Delete messages</span>
            <div className="w-12" /> {/* Spacer */}
          </header>
        ) : (
          <header className="sticky top-0 z-30 px-3 md:px-5 py-3 border-b border-border flex items-center gap-2 bg-card min-h-[65px] shrink-0">
            <Link to="/app/chat" className="md:hidden h-10 w-10 -ml-1 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary shrink-0 touch-target">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="flex-1 min-w-0 flex items-center gap-3 -mx-1 px-1 py-1 rounded-lg hover:bg-secondary text-left"
              aria-label="Toggle details"
            >
              <div className="relative shrink-0">
                <img src="/icons/icon-256.webp" alt="Logo" className="h-10 w-10 rounded-full object-cover border border-border/20" />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">Jackpot Jungle</p>
                <p className="text-xs text-muted-foreground truncate">Official page · We usually reply within minutes</p>
              </div>
            </button>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => startCall({ calleeId: null, kind: "voice", peer: { name: "Jackpot Jungle", avatar: null }, context: "page_broadcast", pageConversationId: convId })}
                className="h-10 w-10 rounded-full flex items-center justify-center text-primary hover:bg-secondary active:bg-secondary/80 touch-target"
                aria-label="Voice call"
                title="Voice call"
              >
                <Phone className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => startCall({ calleeId: null, kind: "video", peer: { name: "Jackpot Jungle", avatar: null }, context: "page_broadcast", pageConversationId: convId })}
                className="h-10 w-10 rounded-full flex items-center justify-center text-primary hover:bg-secondary active:bg-secondary/80 touch-target"
                aria-label="Video call"
                title="Video call"
              >
                <Video className="h-5 w-5" />
              </button>
            </div>
          </header>
        )}

        {pinnedMessages.length > 0 && (
          <div className="bg-secondary/60 backdrop-blur-sm border-b border-border px-4 py-2 flex items-center justify-between text-xs text-foreground z-10 transition-all select-none">
            <div className="flex items-center gap-2 truncate flex-1 cursor-pointer" onClick={() => jumpToMessage(pinnedMessages[pinnedMessages.length - 1].id)}>
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

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto smooth-scroll px-4 py-6 space-y-1 relative">
          {/* Floating scroll bottom indicator */}
          {showScrollToBottom && (
            <button
              type="button"
              onClick={() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                setShowScrollToBottom(false);
              }}
              className="absolute bottom-20 right-6 bg-primary text-primary-foreground p-3 rounded-full shadow-lg hover:opacity-90 flex items-center gap-1.5 text-xs font-semibold animate-bounce z-40"
            >
              <ChevronDown className="h-4 w-4" />
              <span>New messages</span>
            </button>
          )}

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
                    {showTime && c.created_at && !isNaN(new Date(c.created_at).getTime()) && (
                      <div className="flex justify-center py-3 select-none">
                        <span className="premium-date-header">
                          {format(new Date(c.created_at), "MMM d, h:mm a")}
                        </span>
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

              return (
                <PageMessageItem
                  key={m.id}
                  m={m}
                  meId={meId}
                  isLastMine={isLastMine}
                  showTime={showTime}
                  selectionMode={selectionMode}
                  isSelected={selectedMsgs.has(m.id)}
                  msgRefs={msgRefs}
                  onSelect={handleSelect}
                  onReact={handleReact}
                  onPin={handlePin}
                  onUnpin={handleUnpin}
                  onReply={handleReply}
                  onCopy={handleCopy}
                  onDelete={handleDelete}
                  onForward={handleForward}
                  onPreviewImage={handlePreviewImage}
                  onMenuOpen={handleMenuOpen}
                  jumpToMessage={jumpToMessage}
                />
              );
            });
          })()}
        </div>

        {/* Replying banner */}
        {replyingTo && (
          <div className="px-4 py-2 bg-secondary/80 border-t border-border flex items-center justify-between text-xs z-10 reply-preview-enter animate-in slide-in-from-bottom-2 duration-150 select-none">
            <div className="truncate flex-1">
              <span className="font-bold text-primary block text-[10px] uppercase">Replying to {replyingTo.from_page ? "Jackpot Jungle" : "yourself"}</span>
              <span className="truncate block italic">{replyingTo.content || "Media / Attachment"}</span>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} className="h-6 w-6 rounded-full hover:bg-secondary/80 flex items-center justify-center ml-2 shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {editingMessageId && (() => {
          const editingMsg = messages.find(x => x.id === editingMessageId);
          return (
            <div className="px-4 py-2 bg-secondary/80 border-t border-border flex items-center justify-between text-xs z-10 reply-preview-enter animate-in slide-in-from-bottom-2 duration-150 select-none">
              <div className="truncate flex-1">
                <span className="font-bold text-primary block text-[10px] uppercase">Editing Message</span>
                <span className="truncate block italic">{editingMsg?.content || ""}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingMessageId(null);
                  setDraft("");
                }}
                className="h-6 w-6 rounded-full hover:bg-secondary/80 flex items-center justify-center ml-2 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })()}

        {selectionMode ? (
          <div className="p-3 border-t border-border flex items-center justify-center bg-card">
            <button
              type="button"
              disabled={selectedMsgs.size === 0}
              onClick={() => setShowDeleteBottomSheet(true)}
              className="w-full max-w-md py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-bold rounded-xl text-sm transition-colors text-center shadow-md animate-in slide-in-from-bottom duration-250"
            >
              Delete ({selectedMsgs.size})
            </button>
          </div>
        ) : (
          <MessengerComposer
            value={draft}
            onChange={(v) => setDraft(v)}
            onSubmit={(e) => void send(e)}
            onFileChange={(e) => void onPickImage(e)}
            onVoice={onVoice}
            onThumbsUp={() => void send(undefined, "👍")}
            placeholder="Aa"
            sending={sending}
            uploading={uploading}
            recUploading={recUploading}
            showEmojiButton
            fileRef={fileRef}
            inputRef={inputRef}
            autoFocus
          />
        )}
      </div>

      {/* Desktop Detail Sidebar */}
      {showDetail && (
        <aside className="w-80 border-l border-border bg-card hidden lg:flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200 shrink-0">
          <ConversationDetailPanel username="Jackpot Jungle" avatar={null} isPage={true} pinnedMessages={pinnedMessages} onClose={() => setShowDetail(false)} />
        </aside>
      )}

      {/* Mobile/Tablet Detail Sheet */}
      <Sheet open={showDetail && isMobile} onOpenChange={setShowDetail}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 lg:hidden bg-card border-l border-border text-foreground">
          <ConversationDetailPanel username="Jackpot Jungle" avatar={null} isPage={true} pinnedMessages={pinnedMessages} onClose={() => setShowDetail(false)} />
        </SheetContent>
      </Sheet>

      {/* Forward Modal */}
      {forwardTargetMsg && (() => {
        const filteredCandidates = forwardCandidates.filter((c) =>
          c.name.toLowerCase().includes(forwardSearch.toLowerCase())
        );
        return (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={() => { setForwardTargetMsg(null); setForwardSearch(""); }} />
            <div className="relative bg-background/70 dark:bg-card/65 backdrop-blur-xl border border-border/80 w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[70vh] overflow-hidden animate-in zoom-in-95 duration-200 z-10 text-foreground">
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-transparent">
                <h3 className="font-bold text-base">Forward message</h3>
                <button type="button" onClick={() => { setForwardTargetMsg(null); setForwardSearch(""); }} className="h-8 w-8 rounded-full hover:bg-secondary/40 flex items-center justify-center">
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              {/* Messenger style Search Bar */}
              <div className="px-4 py-2 border-b border-border/40 bg-transparent shrink-0">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/80" />
                  <Input
                    placeholder="Search friends"
                    value={forwardSearch}
                    onChange={(e) => setForwardSearch(e.target.value)}
                    className="pl-9 rounded-full bg-secondary/40 border-transparent text-xs h-8 focus:bg-secondary/60 focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {forwardCandidates.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-6">No matching candidates found.</p>
                ) : (
                  filteredCandidates.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-secondary/15 border border-border/20 hover:bg-secondary/35 transition-colors animate-in slide-in-from-bottom-2 duration-150">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={c.name} url={c.avatar} size={36} />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground/75 uppercase tracking-wide">
                            {c.type === "page" ? "Official page" : "Friend"}
                          </p>
                        </div>
                      </div>
                      <Button 
                        onClick={() => executeForward(c)} 
                        disabled={forwardingTargetId !== null} 
                        size="sm" 
                        className="rounded-full shrink-0 shadow-sm"
                      >
                        {forwardingTargetId === c.id ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Message Context Menu & Reactions */}
      {activeMsgMenu && (() => {
        const m = parsedMessages.find(x => x.id === activeMsgMenu);
        if (!m) return null;
        const mine = !m.from_page;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setActiveMsgMenu(null)} />
            <div className="relative w-full max-w-[280px] flex flex-col gap-3 context-menu-pop z-10">
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
                    className="text-2xl reaction-emoji-btn"
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
                {mine && !m.image_url && !m.audio_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(m.content || "");
                      setEditingMessageId(m.id);
                      setReplyingTo(null);
                      setActiveMsgMenu(null);
                    }}
                    className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                  >
                    <Edit className="h-4 w-4 text-primary" />
                    <span>Edit</span>
                  </button>
                )}
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
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode(true);
                    setSelectedMsgs(new Set([m.id]));
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForwardTargetMsg(m);
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                >
                  <Forward className="h-4 w-4 text-primary" />
                  <span>Forward</span>
                </button>
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
                    className="p-3 bg-secondary/30 hover:bg-secondary/60 border border-border rounded-xl transition-colors flex flex-col gap-1.5 relative group cursor-pointer"
                    onClick={() => { jumpToMessage(m.id); setShowAllPins(false); }}
                  >
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-bold text-primary">
                        {m.from_page ? "Jackpot Jungle" : "You"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{m.created_at && !isNaN(new Date(m.created_at).getTime()) ? formatDistanceToNow(new Date(m.created_at), { addSuffix: true }) : ""}</span>
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
                    <p className="text-xs text-foreground line-clamp-3 break-words">
                      {m.content || (m.image_url ? "Image 📷" : "Voice message 🎙️")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteBottomSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowDeleteBottomSheet(false)} />
          <div className="relative bg-card border border-border w-full max-w-[320px] rounded-2xl shadow-2xl p-5 flex flex-col gap-3 animate-in zoom-in-95 duration-200 z-10 text-foreground text-center">
            <h3 className="font-bold text-base leading-snug">Delete {selectedMsgs.size} message{selectedMsgs.size > 1 ? "s" : ""}?</h3>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
            
            <div className="flex flex-col gap-2 mt-2">
              {allSelectedAreMine && (
                <button
                  type="button"
                  onClick={async () => {
                    setShowDeleteBottomSheet(false);
                    const targetIds = Array.from(selectedMsgs);
                    setSelectionMode(false);
                    setSelectedMsgs(new Set());
                    
                    try {
                      await unsendPageMessagesServer({ data: { ids: targetIds } });
                      setMessages(prev => prev.map(m => targetIds.includes(m.id) ? { ...m, content: "[system:unsent]", image_url: null, audio_url: null } : m));
                      toast.success(`${targetIds.length} message${targetIds.length > 1 ? "s" : ""} deleted for everyone`);
                    } catch (e: any) {
                      toast.error(e?.message || "Could not unsend message");
                    }
                  }}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-colors text-center shadow-sm"
                >
                  Delete for everyone
                </button>
              )}
              
              <button
                type="button"
                onClick={() => {
                  setShowDeleteBottomSheet(false);
                  const targetIds = Array.from(selectedMsgs);
                  setSelectionMode(false);
                  setSelectedMsgs(new Set());
                  deleteForMe(targetIds);
                  toast.success(`${targetIds.length} message${targetIds.length > 1 ? "s" : ""} deleted for you`);
                }}
                className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-xl text-xs transition-colors text-center border border-border/40"
              >
                Delete for you
              </button>
              
              <button
                type="button"
                onClick={() => setShowDeleteBottomSheet(false)}
                className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-muted-foreground font-semibold rounded-xl text-xs transition-colors text-center border border-border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div className="h-20 w-20 rounded-full flex items-center justify-center shrink-0 mb-3 shadow-md overflow-hidden border border-border/20">
              <img src="/icons/icon-256.webp" alt="Logo" className="h-full w-full object-cover" />
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

interface PageMessageItemProps {
  m: any;
  meId: string | null;
  isLastMine: boolean;
  showTime: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  msgRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onSelect: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onReply: (m: any) => void;
  onCopy: (text: string) => void;
  onDelete: (id: string) => void;
  onForward: (m: any) => void;
  onPreviewImage: (url: string) => void;
  onMenuOpen: (id: string) => void;
  jumpToMessage: (id: string) => void;
}

const printStatementFromMessage = async (content: string, userId: string) => {
  let filter = "all";
  if (content.includes("STATEMENT (WALLET)")) filter = "wallet";
  else if (content.includes("STATEMENT (CREDIT)")) filter = "credit";

  let startDate: string | undefined = undefined;
  let endDate: string | undefined = undefined;

  const rangeMatch = content.match(/Date Range:\s*(.*)/i);
  if (rangeMatch && rangeMatch[1]) {
    const range = rangeMatch[1].trim();
    if (range !== "All Time") {
      const parts = range.split(/\s+to\s+/i);
      if (parts[0] && parts[0] !== "Beginning") {
        try {
          startDate = new Date(parts[0]).toISOString().split('T')[0];
        } catch {}
      }
      if (parts[1] && parts[1] !== "Present") {
        try {
          endDate = new Date(parts[1]).toISOString().split('T')[0];
        } catch {}
      }
    }
  }

  // 1. Open the print window synchronously to avoid popup blockers
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return toast.error("Please allow popups to print/view the statement PDF.");
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Loading Statement...</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 80vh; color: #666; }
        </style>
      </head>
      <body>
        <div>
          <h2>Loading Statement Details...</h2>
          <p>Please wait while we compile the transactions.</p>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();

  const toastId = toast.loading("Generating printable statement PDF...");
  try {
    let query = supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("deleted", false)
      .neq("action", "cashin")
      .neq("action", "cashout")
      .order("created_at", { ascending: false });

    if (startDate) {
      query = query.gte("created_at", `${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      query = query.lte("created_at", `${endDate}T23:59:59.999Z`);
    }

    const { data: txs, error: txsErr } = await query;
    if (txsErr) throw txsErr;

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) throw new Error("Customer profile not found");

    const customerName = profile.first_name
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : profile.username;

    // Filter txs on client side according to wallet/credit filter
    const filteredTxs = (txs || []).filter((tx: any) => {
      if (filter === "wallet") {
        return tx.action === "deposit" || tx.action === "used" || tx.action === "deduct_credit";
      } else if (filter === "credit") {
        return tx.action === "credit_added" || tx.action === "released" || tx.action === "used" || tx.action === "deduct_credit";
      }
      return true;
    });

    let tableHeaders = "";
    let colspan = 8;
    if (filter === "wallet") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Avail. Before</th>
        <th style="text-align: right;">Avail. After</th>
        <th>Reason</th>
      `;
      colspan = 6;
    } else if (filter === "credit") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Credit Before</th>
        <th style="text-align: right;">Credit After</th>
        <th>Reason</th>
      `;
      colspan = 6;
    } else {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Avail. Before</th>
        <th style="text-align: right;">Avail. After</th>
        <th style="text-align: right;">Credit Before</th>
        <th style="text-align: right;">Credit After</th>
        <th>Reason</th>
      `;
      colspan = 8;
    }

    const txRows = filteredTxs.map((tx: any) => {
      let cells = `
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(tx.created_at).toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-transform: uppercase; font-weight: bold;">${tx.action}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.amount).toFixed(2)}</td>
      `;

      if (filter === "wallet") {
        cells += `
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_after).toFixed(2)}</td>
        `;
      } else if (filter === "credit") {
        cells += `
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.credit_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.credit_after).toFixed(2)}</td>
        `;
      } else {
        cells += `
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_after).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.credit_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.credit_after).toFixed(2)}</td>
        `;
      }

      cells += `
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.reason}</td>
      `;

      return `<tr>${cells}</tr>`;
    }).join("");

    let summaryHTML = "";
    if (filter === "wallet") {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Available Balance:</strong> $${(profile.wallet_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Deposits:</strong> $${(profile.wallet_deposits ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Used:</strong> $${(profile.wallet_used ?? 0).toFixed(2)}</p>
        </div>
      `;
    } else if (filter === "credit") {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Credit Balance:</strong> $${(profile.credit_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Released:</strong> $${(profile.wallet_released ?? 0).toFixed(2)}</p>
        </div>
      `;
    } else {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Available Balance:</strong> $${(profile.wallet_balance ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Credit Balance:</strong> $${(profile.credit_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Deposits:</strong> $${(profile.wallet_deposits ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Released:</strong> $${(profile.wallet_released ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Used:</strong> $${(profile.wallet_used ?? 0).toFixed(2)}</p>
        </div>
      `;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Jackpot Jungle Ledger Statement</title>
          <style>
            body { font-family: sans-serif; padding: 24px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background-color: #f5f5f5; text-align: left; padding: 8px; border-bottom: 2px solid #ddd; }
            .header { margin-bottom: 30px; border-bottom: 3px solid #10b981; padding-bottom: 16px; }
            .summary { background: #f9f9f9; padding: 16px; border-radius: 8px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0; color: #10b981;">JACKPOT JUNGLE</h1>
            <p style="margin: 4px 0 0 0; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Wallet ledger statement</p>
          </div>
          <div>
            <h3 style="margin: 0;">Customer Name: ${customerName}</h3>
            <p style="margin: 4px 0; font-size: 13px;">Username: @${profile.username}</p>
            <p style="margin: 4px 0; font-size: 13px;">Statement generated: ${new Date().toLocaleString()}</p>
          </div>
          <div class="summary" style="display: flex; justify-content: space-between; margin-top: 20px;">
            ${summaryHTML}
          </div>
          <table>
            <thead>
              <tr>
                ${tableHeaders}
              </tr>
            </thead>
            <tbody>
              ${txRows || `<tr><td colspan="${colspan}" style="text-align: center; padding: 20px;">No transaction records found.</td></tr>`}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
    toast.dismiss(toastId);
    toast.success("Statement PDF opened for printing!");
  } catch (err: any) {
    printWindow.close();
    toast.dismiss(toastId);
    toast.error(err.message || "Failed to generate print statement");
  }
};

const PageMessageItem = React.memo(function PageMessageItem({
  m,
  meId,
  isLastMine,
  showTime,
  selectionMode,
  isSelected,
  msgRefs,
  onSelect,
  onReact,
  onPin,
  onUnpin,
  onReply,
  onCopy,
  onDelete,
  onForward,
  onPreviewImage,
  onMenuOpen,
  jumpToMessage,
}: PageMessageItemProps) {
  const mine = !m.from_page;
  const [showSelfTime, setShowSelfTime] = useState(false);
  const reactionKeys = Object.keys(m.reactions || {}).filter(k => m.reactions[k].length > 0);
  const isStatement = m.content?.startsWith("📄 JACKPOT JUNGLE STATEMENT");

  const pressTimerRef = useRef<any>(null);
  const startPress = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      onMenuOpen(m.id);
    }, 600);
  };
  const cancelPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

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
    <div 
      ref={(el) => { msgRefs.current[m.id] = el; }}
      className={`group/msg py-1 flex items-center gap-3 transition-colors ${selectionMode ? "hover:bg-secondary/10 cursor-pointer" : ""}`}
      onClick={() => {
        if (selectionMode) {
          onSelect(m.id);
        }
      }}
    >
      {selectionMode && (
        <div className="pl-3 shrink-0 flex items-center justify-center">
          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 bg-transparent"}`}>
            {isSelected && (
              <svg className="h-3 w-3 fill-current stroke-current" viewBox="0 0 24 24" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {showTime && m.created_at && !isNaN(new Date(m.created_at).getTime()) && (
          <div className="flex justify-center py-3 select-none">
            <span className="premium-date-header">
              {format(new Date(m.created_at), "MMM d, h:mm a")}
            </span>
          </div>
        )}
        
        {/* Reply To Preview */}
        {m.replyTo && (
          <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-1`}>
            <div 
              onClick={(e) => { e.stopPropagation(); jumpToMessage(m.replyTo!.id); }}
              className="max-w-[70%] flex items-center gap-1.5 px-3 py-1 bg-secondary/40 border border-border/40 rounded-xl text-xs text-muted-foreground select-none cursor-pointer hover:bg-secondary/80 transition-colors"
            >
              <Reply className="h-3 w-3 shrink-0" />
              <span className="font-semibold text-primary">{m.replyTo.senderName}</span>
              <span className="truncate max-w-[120px]">{m.replyTo.text}</span>
            </div>
          </div>
        )}

        {m.isForwarded && (
          <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-0.5 px-2`}>
            <span className="text-[10px] text-muted-foreground/60 italic flex items-center gap-1 select-none">
              <Forward className="h-3 w-3 text-muted-foreground/50" />
              Forwarded
            </span>
          </div>
        )}

        <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div
            onPointerDown={selectionMode ? undefined : startPress}
            onPointerUp={selectionMode ? undefined : cancelPress}
            onPointerMove={selectionMode ? undefined : cancelPress}
            onPointerLeave={selectionMode ? undefined : cancelPress}
            onContextMenu={(e) => { e.preventDefault(); if (!selectionMode) onMenuOpen(m.id); }}
            className={`relative select-none ${selectionMode ? "pointer-events-none" : "cursor-pointer"}`}
            onClick={() => {
              if (!selectionMode) {
                setShowSelfTime(!showSelfTime);
              }
            }}
          >
            {m.image_url ? (
              <button onClick={() => onPreviewImage(toCDNUrl(m.image_url))} className="max-w-[200px] rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary block select-none min-h-[150px] bg-secondary/35 flex items-center justify-center">
                <CachedImage
                  src={toCDNUrl(m.image_url)}
                  alt=""
                  className="block max-h-80 w-[200px] object-cover rounded-2xl"
                  style={{ width: "200px", height: "auto", maxHeight: "320px" }}
                  cachePolicy="volatile"
                />
              </button>
            ) : m.audio_url ? (
              <div className="block">
                <VoiceMessage src={toCDNUrl(m.audio_url)} mine={mine} />
              </div>
            ) : isStatement ? (
              <div
                onClick={async (e) => {
                  e.stopPropagation();
                  await printStatementFromMessage(m.content || "", meId);
                }}
                className={`max-w-[240px] rounded-2xl px-4 py-3 text-sm select-none cursor-pointer border border-primary/20 hover:opacity-90 active:scale-[0.98] transition-all flex flex-col gap-2 ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"}`}
              >
                <div className="flex items-center gap-2 border-b border-current/10 pb-1.5 font-bold">
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span>Click to Print PDF</span>
                </div>
                <p className="text-[12px] whitespace-pre-wrap break-words leading-relaxed font-mono opacity-90">
                  {m.content}
                </p>
              </div>
            ) : (
              <div className={`max-w-[240px] px-4 py-2 rounded-2xl ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"}`}>
                <p className="text-[14px] whitespace-pre-wrap break-words leading-relaxed">
                  {m.content}
                  {m.is_edited && (
                    <span className="text-[10px] opacity-60 ml-1.5 select-none font-medium text-inherit italic">
                      (edited)
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {showSelfTime && m.created_at && !isNaN(new Date(m.created_at).getTime()) && (
          <div className={`flex mt-0.5 ${mine ? "justify-end" : "justify-start"} px-2 select-none`}>
            <span className="text-[9px] text-muted-foreground/60 font-semibold">
              {format(new Date(m.created_at), "MMM d, h:mm a")}
            </span>
          </div>
        )}

        {/* Reactions Badge */}
        {reactionKeys.length > 0 && (
          <div className={`flex mt-1 ${mine ? "justify-end" : "justify-start"} px-1`}>
            <div className="inline-flex items-center gap-1 bg-secondary border border-border/80 px-2 py-0.5 rounded-full shadow-sm text-xs leading-none">
              {reactionKeys.map(k => (
                <span key={k} onClick={() => onReact(m.id, k)} className="cursor-pointer" title={m.reactions[k].join(", ")}>{k}</span>
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

        {mine && (isLastMine || m.failed || (m as any).queued) && (
          <div className="flex items-center justify-end gap-1.5 pr-2 pt-1 min-h-5 text-[11px] font-medium leading-none text-message-status">
            {m.failed ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toast.promise(NetworkManager.retryMessage(m.id), {
                    loading: "Retrying message...",
                    success: "Message sent!",
                    error: "Failed to retry message."
                  });
                }}
                className="inline-flex items-center gap-1 text-destructive hover:underline cursor-pointer font-bold"
              >
                <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                Not delivered. Tap to retry
              </button>
            ) : (m.id && typeof m.id === "string" && (m.id.startsWith("temp-") || (m as any).queued)) ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-message-status/60 animate-pulse shrink-0" />
                Sending…
              </span>
            ) : m.seen ? (
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />Seen</span>
            ) : (
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-message-status/60 shrink-0" />Delivered</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

