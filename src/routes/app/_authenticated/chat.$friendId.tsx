import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { toCDNUrl } from "@/config";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, ArrowLeft, ImageIcon, Smile, Loader2, X, Search, ChevronUp, ChevronDown, Phone, Video, Pin, Reply, Trash2, Forward, Copy, MoreHorizontal, Info, Bell, Sparkles, BookOpen, Megaphone } from "lucide-react";
import { Avatar } from "@/components/messenger/Avatar";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { VoiceMessage } from "@/components/messenger/VoiceMessage";
import { CallMessage } from "@/components/messenger/CallMessage";
import { useCalls } from "@/components/messenger/CallProvider";
import { uploadAndSign } from "@/lib/chat-media";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { unsendMessagesServer } from "@/lib/messages.functions";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  getCachedProfile,
  getCachedMessages,
  setCachedProfile,
  setCachedMessages,
} from "@/lib/chat-cache";

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: "voice" | "video";
  status: "ringing" | "active" | "ended" | "missed" | "declined" | "canceled";
  duration_seconds: number;
  created_at: string;
};

export const Route = createFileRoute("/app/_authenticated/chat/$friendId")({
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
type Profile = { 
  id: string; 
  username: string; 
  first_name?: string | null; 
  last_name?: string | null; 
  avatar_url: string | null; 
  online: boolean; 
  last_seen: string;
  friend_code?: string;
  referral_code?: string;
  phone?: string | null;
  address?: string | null;
  created_at?: string;
};

function ChatView() {
  const { friendId } = useParams({ from: "/app/_authenticated/chat/$friendId" });
  const { user } = useAuth();
  const [meId, setMeId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("jj_me_id");
  });

  useEffect(() => {
    if (user?.id) {
      setMeId(user.id);
      try {
        localStorage.setItem("jj_me_id", user.id);
      } catch {}
    }
  }, [user]);

  const [friend, setFriend] = useState<Profile | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cachedProfile = getCachedProfile(friendId);
      return cachedProfile || null;
    } catch {}
    return null;
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const myId = localStorage.getItem("jj_me_id");
      if (myId) {
        const cachedMsgs = getCachedMessages(myId, friendId);
        return cachedMsgs || [];
      }
    } catch {}
    return [];
  });
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const isNearBottomRef = useRef(true);
  const friendDisplayName = friend
    ? (friend.first_name ? (friend.last_name ? `${friend.first_name} ${friend.last_name}` : friend.first_name) : friend.username)
    : "Friend";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMountedRef = useRef(true);
  const load = useCallback(async () => {
    if (!meId) return;
    isInitialLoadRef.current = true;

    const isSystem = friendId.startsWith("system-");
    if (isSystem) {
      const isRules = friendId === "system-rules-chat";
      const virtualFriend = {
        id: friendId,
        username: isRules ? "system_rules" : "system_updates",
        first_name: isRules ? "Rules" : "Updates",
        last_name: "",
        avatar_url: null,
        online: true,
        last_seen: new Date().toISOString()
      } as any;
      setFriend(virtualFriend);
      setMessages([]);

      try {
        const channelType = isRules ? "rules" : "updates";
        const { data: anns, error } = await supabase
          .from("system_announcements")
          .select("*")
          .eq("channel_type", channelType)
          .order("created_at", { ascending: true });
        
        if (error) throw error;
        if (!isMountedRef.current) return;

        const converted = (anns ?? []).map(ann => ({
          id: ann.id,
          sender_id: ann.sender_id || "system",
          receiver_id: meId,
          content: ann.content,
          image_url: ann.image_url,
          audio_url: ann.audio_url,
          created_at: ann.created_at,
          seen: true,
          delivered: true
        }));
        setMessages(converted);
        setHasOlderMessages(false);

        const lastMsg = converted[converted.length - 1];
        if (lastMsg) {
          localStorage.setItem(isRules ? "jj_rules_last_read" : "jj_updates_last_read", lastMsg.created_at);
        }
      } catch (e: any) {
        console.error("Error loading system announcements:", e);
      }
      return;
    }

    // ── Step 1: Show cached data INSTANTLY (zero wait) ──────────────────
    const cachedProfile = getCachedProfile(friendId);
    const cachedMsgs = getCachedMessages(meId, friendId);
    setFriend(cachedProfile || null);
    setMessages(cachedMsgs || []);

    // ── Step 2: Fetch fresh data/delta in background ─────────────────────
    const PAGE = 50;
    const lastCachedMsg = cachedMsgs && cachedMsgs.length > 0 ? cachedMsgs[cachedMsgs.length - 1] : null;

    try {
      if (lastCachedMsg) {
        const [{ data: prof }, { data: deltaMsgs }, { data: spamRow }, { data: callRows }] = await Promise.all([
          supabase.from("profiles").select("id, username, first_name, last_name, avatar_url, online, last_seen, friend_code, referral_code, phone, address, created_at").eq("id", friendId).maybeSingle(),
          supabase.from("messages").select("*")
            .or(`and(sender_id.eq.${meId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${meId})`)
            .gt("created_at", lastCachedMsg.created_at)
            .order("created_at", { ascending: false }),
          supabase.from("spam_list").select("id").eq("user_id", friendId).eq("spammed_user_id", meId).maybeSingle(),
          supabase.from("calls").select("id, caller_id, callee_id, call_type, status, duration_seconds, created_at")
            .or(`and(caller_id.eq.${meId},callee_id.eq.${friendId}),and(caller_id.eq.${friendId},callee_id.eq.${meId})`)
            .eq("context", "friend")
            .order("created_at", { ascending: true }).limit(200),
        ]);
        if (!isMountedRef.current) return;

        const profile = prof as Profile | null;
        if (profile && spamRow) profile.online = false;
        if (profile) { setFriend(profile); setCachedProfile(friendId, profile); }

        const delta = (deltaMsgs ?? []) as Message[];
        const combined = [...(cachedMsgs || [])];
        delta.reverse().forEach((m) => {
          if (!combined.some((x) => x.id === m.id)) {
            combined.push(m);
          }
        });

        setMessages(combined);
        setCachedMessages(meId, friendId, combined);
        setCalls(((callRows ?? []) as CallRow[]).filter((c) => c.status !== "ringing" && c.status !== "active"));
      } else {
        const [{ data: prof }, { data: msgs }, { data: spamRow }, { data: callRows }] = await Promise.all([
          supabase.from("profiles").select("id, username, first_name, last_name, avatar_url, online, last_seen, friend_code, referral_code, phone, address, created_at").eq("id", friendId).maybeSingle(),
          supabase.from("messages").select("*")
            .or(`and(sender_id.eq.${meId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${meId})`)
            .order("created_at", { ascending: false }).limit(PAGE + 1),
          supabase.from("spam_list").select("id").eq("user_id", friendId).eq("spammed_user_id", meId).maybeSingle(),
          supabase.from("calls").select("id, caller_id, callee_id, call_type, status, duration_seconds, created_at")
            .or(`and(caller_id.eq.${meId},callee_id.eq.${friendId}),and(caller_id.eq.${friendId},callee_id.eq.${meId})`)
            .eq("context", "friend")
            .order("created_at", { ascending: true }).limit(200),
        ]);
        if (!isMountedRef.current) return;

        const profile = prof as Profile | null;
        if (profile && spamRow) profile.online = false;
        if (profile) { setFriend(profile); setCachedProfile(friendId, profile); }

        const rawMsgs = (msgs ?? []) as Message[];
        const hasMore = rawMsgs.length > PAGE;
        const pageMsgs = rawMsgs.slice(0, PAGE).reverse();
        setHasOlderMessages(hasMore);
        setMessages(pageMsgs);
        setCachedMessages(meId, friendId, pageMsgs);
        setCalls(((callRows ?? []) as CallRow[]).filter((c) => c.status !== "ringing" && c.status !== "active"));
      }

      await supabase.from("messages").update({ seen: true, delivered: true } as any)
        .eq("sender_id", friendId).eq("receiver_id", meId).eq("seen", false);
    } catch (err) {
      console.error("Error fetching chat data:", err);
    }
  }, [friendId, meId]);

  useEffect(() => {
    isMountedRef.current = true;
    load();
    return () => { isMountedRef.current = false; };
  }, [load]);

  // Load 50 older messages above the current batch
  async function loadOlderMessages() {
    if (!meId || loadingOlder || !hasOlderMessages) return;
    setLoadingOlder(true);
    const oldest = messages[0]?.created_at;
    const PAGE = 50;
    const query = supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${meId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${meId})`
      )
      .order("created_at", { ascending: false })
      .limit(PAGE + 1);
    if (oldest) query.lt("created_at", oldest);
    const { data } = await query;
    const rows = (data ?? []) as Message[];
    const hasMore = rows.length > PAGE;
    const batch = rows.slice(0, PAGE).reverse();
    // Preserve scroll position: remember height before adding messages
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setMessages((prev) => [...batch, ...prev]);
    setHasOlderMessages(hasMore);
    setLoadingOlder(false);
    // After render, restore scroll so user stays at same position
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  const activeFriendIdRef = useRef(friendId);
  useEffect(() => {
    activeFriendIdRef.current = friendId;
    load();
  }, [friendId]);

  useEffect(() => {
    if (!meId) return;

    const rand = Math.random().toString(36).slice(2, 9);
    const isSystem = friendId.startsWith("system-");

    if (isSystem) {
      const channelType = friendId === "system-rules-chat" ? "rules" : "updates";
      const annChannel = supabase
        .channel(`chat-active-announcements-${rand}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_announcements", filter: `channel_type=eq.${channelType}` }, (payload) => {
          const ann = payload.new as any;
          if (ann) {
            const m = {
              id: ann.id,
              sender_id: ann.sender_id || "system",
              receiver_id: meId,
              content: ann.content,
              image_url: ann.image_url,
              audio_url: ann.audio_url,
              created_at: ann.created_at,
              seen: true,
              delivered: true
            } as any;
            setMessages((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev;
              const next = [...prev, m];
              localStorage.setItem(channelType === "rules" ? "jj_rules_last_read" : "jj_updates_last_read", m.created_at);
              return next;
            });
          }
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "system_announcements", filter: `channel_type=eq.${channelType}` }, (payload) => {
          const old = payload.old as any;
          if (old) {
            setMessages((prev) => prev.filter(x => x.id !== old.id));
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(annChannel);
      };
    }

    const msgChannel = supabase
      .channel(`chat-active-friend-global-${rand}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        const currentFriendId = activeFriendIdRef.current;
        const involves = (m.sender_id === meId && m.receiver_id === currentFriendId) ||
                         (m.sender_id === currentFriendId && m.receiver_id === meId);

        if (involves) {
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            const idx = prev.findIndex((x) =>
              x.id && typeof x.id === "string" && x.id.startsWith("temp-") &&
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
        } else {
          const otherFid = m.sender_id === meId ? m.receiver_id : m.sender_id;
          const cached = getCachedMessages(meId, otherFid);
          if (cached && !cached.some(x => x.id === m.id)) {
            setCachedMessages(meId, otherFid, [...cached, m]);
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        const currentFriendId = activeFriendIdRef.current;
        const involves = (m.sender_id === meId && m.receiver_id === currentFriendId) ||
                         (m.sender_id === currentFriendId && m.receiver_id === meId);

        if (involves) {
          setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        } else {
          const otherFid = m.sender_id === meId ? m.receiver_id : m.sender_id;
          const cached = getCachedMessages(meId, otherFid);
          if (cached) {
            setCachedMessages(meId, otherFid, cached.map(x => x.id === m.id ? m : x));
          }
        }
      })
      .subscribe();

    const typingChannel = supabase
      .channel(`typing-active-friend-global-${rand}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        const data = payload.payload as { from: string; to: string };
        if (data && data.from === activeFriendIdRef.current && data.to === meId) {
          setFriendTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setFriendTyping(false), 2500);
        }
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    const callsChannel = supabase
      .channel(`calls-active-friend-global-${rand}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (payload) => {
        const row = (payload.new ?? payload.old) as CallRow & { context?: string };
        if (!row || (row as any).context !== "friend") return;
        
        const currentFriendId = activeFriendIdRef.current;
        const involves = (row.caller_id === meId && row.callee_id === currentFriendId) || 
                         (row.caller_id === currentFriendId && row.callee_id === meId);
                         
        if (!involves) return;
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

  const lastMsgCountRef = useRef(0);
  const lastFriendIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevCount = lastMsgCountRef.current;
    lastMsgCountRef.current = messages.length;

    if (friendId !== lastFriendIdRef.current) {
      // Switched chat. Scroll to bottom instantly
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        // Schedule microtask to guarantee bottom placement after layout reflow
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      }
      lastFriendIdRef.current = friendId;
      isInitialLoadRef.current = false;
    } else if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const isMine = lastMsg?.sender_id === meId;
      const isSingleNewMessage = messages.length === prevCount + 1;

      if (isSingleNewMessage && (isMine || isNearBottomRef.current)) {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        setShowScrollToBottom(false);
      } else {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        setShowScrollToBottom(false);
      }
    }
  }, [messages, calls, friendTyping, friendId, meId]);

  useEffect(() => {
    if (friend) {
      // Small timeout to allow input element to mount fully
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [friendId, friend]);

  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [confirmPinTarget, setConfirmPinTarget] = useState<string | null>(null);
  const [activeMsgMenu, setActiveMsgMenu] = useState<string | null>(null);
  const [showAllPins, setShowAllPins] = useState(false);
  const [unsendTarget, setUnsendTarget] = useState<string | null>(null);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isNear = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    isNearBottomRef.current = isNear;
    if (isNear) {
      setShowScrollToBottom(false);
    }
  };

  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set());
  const [deletedForMeIds, setDeletedForMeIds] = useState<Set<string>>(new Set());
  const [showDeleteBottomSheet, setShowDeleteBottomSheet] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [forwardTargetMsg, setForwardTargetMsg] = useState<Message | null>(null);
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

  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
      setDeletedForMeIds(new Set(Array.isArray(list) ? list : []));
    } catch {
      setDeletedForMeIds(new Set());
    }
  }, []);

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
    const visible: Array<Message & {
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
  }, [messages]);

  const allSelectedAreMine = useMemo(() => {
    if (selectedMsgs.size === 0) return false;
    for (const id of selectedMsgs) {
      const msg = parsedMessages.find(x => x.id === id);
      if (!msg || msg.sender_id !== meId) return false;
    }
    return true;
  }, [selectedMsgs, parsedMessages, meId]);

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

  const handleSelect = useCallback((id: string) => {
    setSelectedMsgs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleReact = useCallback((id: string, emoji: string) => {
    reactToMessage(id, emoji);
  }, [meId, friendId]);

  const handlePin = useCallback((id: string) => {
    setConfirmPinTarget(id);
  }, []);

  const handleUnpin = useCallback((id: string) => {
    unpinMessage(id);
  }, [meId, friendId]);

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
    const note = prompt("Forward this message to:");
    if (note) toast.success("Forwarded message successfully");
  }, []);

  const handlePreviewImage = useCallback((url: string) => {
    setPreview(url);
  }, []);

  const handleMenuOpen = useCallback((id: string) => {
    setActiveMsgMenu(id);
  }, []);

  function onDraftChange(v: string) {
    setDraft(v);
    const now = Date.now();
    if (typingChannelRef.current && meId && now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { from: meId, to: friendId } });
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
      ? `[reply:${replyingTo.id}:${replyingTo.sender_id === meId ? "You" : friendDisplayName}:${replyingTo.content ? replyingTo.content.slice(0, 30) : replyingTo.image_url ? "Image 📷" : replyingTo.audio_url ? "Voice message 🎙️" : "Message"}] `
      : "";
    const finalContent = replyPrefix + content;
    setReplyingTo(null);

    const tempId = addOptimistic({ content });
    window.dispatchEvent(
      new CustomEvent("jj-message-sent", {
        detail: {
          receiverId: friendId,
          content,
          image_url: null,
          audio_url: null,
          created_at: new Date().toISOString()
        }
      })
    );
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
    window.dispatchEvent(
      new CustomEvent("jj-message-sent", {
        detail: {
          receiverId: friendId,
          content: null,
          image_url: localPreview,
          audio_url: null,
          created_at: new Date().toISOString()
        }
      })
    );
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
    window.dispatchEvent(
      new CustomEvent("jj-message-sent", {
        detail: {
          receiverId: friendId,
          content: null,
          image_url: null,
          audio_url: localPreview,
          created_at: new Date().toISOString()
        }
      })
    );
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

  // Show skeleton UI while loading — feels instant like Messenger
  if (!friend) return (
    <div className="h-full flex-1 flex flex-col min-h-0 bg-background">
      {/* Skeleton Header */}
      <header className="px-3 py-3 border-b border-border flex items-center gap-3 bg-card min-h-[65px]">
        <div className="h-9 w-9 rounded-full bg-secondary animate-pulse" />
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3.5 w-28 rounded bg-secondary animate-pulse" />
          <div className="h-2.5 w-16 rounded bg-secondary/60 animate-pulse" />
        </div>
      </header>
      {/* Skeleton Messages */}
      <div className="flex-1 overflow-hidden px-4 py-6 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <div className={`h-9 rounded-2xl bg-secondary animate-pulse ${i % 3 === 0 ? 'w-40' : i % 3 === 1 ? 'w-56' : 'w-32'}`} style={{ animationDelay: `${i * 80}ms` }} />
          </div>
        ))}
      </div>
      {/* Skeleton Input Bar */}
      <div className="p-3 border-t border-border flex items-center gap-2 bg-card">
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
        <div className="flex-1 h-10 rounded-full bg-secondary animate-pulse" />
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
      </div>
    </div>
  );

  return (
    <div className="h-full flex-1 flex min-h-0 relative w-full overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 bg-background w-full overflow-hidden">
        {selectionMode ? (
        <header className="px-3 md:px-5 py-3 border-b border-border flex items-center justify-between bg-card min-h-[65px]">
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
        <header className="px-3 md:px-5 py-3 border-b border-border flex items-center gap-3 bg-card">
          <Link to="/app/chat" className="md:hidden h-9 w-9 -ml-1 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="relative">
              {friendId === "system-rules-chat" ? (
                <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-white shadow-md">
                  <BookOpen className="h-5 w-5" />
                </div>
              ) : friendId === "system-updates-chat" ? (
                <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Megaphone className="h-5 w-5 animate-pulse" />
                </div>
              ) : (
                <>
                  <Avatar name={friendDisplayName} url={friend?.avatar_url ?? null} size={40} />
                  {friend?.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{friendDisplayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {friendId.startsWith("system-") ? "Official Channel" : friendTyping ? "Typing…" : friend?.online ? "Active now" :
                  (friend?.last_seen && !isNaN(new Date(friend.last_seen).getTime())) ? `Active ${formatDistanceToNow(new Date(friend.last_seen), { addSuffix: true })}` : "Offline"}
              </p>
            </div>
          </div>
          {!friendId.startsWith("system-") && (
            <>
              <button
                type="button"
                onClick={() => friend && startCall({ calleeId: friend.id, kind: "voice", peer: { name: friendDisplayName, avatar: friend.avatar_url }, context: "friend" })}
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary"
                aria-label="Voice call"
              >
                <Phone className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => friend && startCall({ calleeId: friend.id, kind: "video", peer: { name: friendDisplayName, avatar: friend.avatar_url }, context: "friend" })}
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary"
                aria-label="Video call"
              >
                <Video className="h-5 w-5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => { setSearchOpen((v) => !v); setSearchQuery(""); setActiveMatch(0); }}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"
            aria-label="Search in conversation"
          >
            <Search className="h-5 w-5" />
          </button>
          {!friendId.startsWith("system-") && (
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"
              aria-label="Toggle details sidebar"
            >
              <Info className="h-5 w-5" />
            </button>
          )}
        </header>
      )}

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

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto smooth-scroll px-4 py-6 space-y-2 relative">
        {/* Floating scroll bottom arrow */}
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
        {/* Load older messages button */}
        {hasOlderMessages && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="flex items-center gap-1.5 text-xs text-primary font-semibold bg-primary/10 hover:bg-primary/20 disabled:opacity-50 px-4 py-1.5 rounded-full transition-colors"
            >
              {loadingOlder ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
              {loadingOlder ? "Loading..." : "Load older messages"}
            </button>
          </div>
        )}
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
                  {showTime && c.created_at && !isNaN(new Date(c.created_at).getTime()) && (
                    <div className="flex justify-center py-3 select-none">
                      <span className="premium-date-header">
                        {format(new Date(c.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"} p-1`}>
                    <CallMessage 
                      mine={mine} 
                      kind={c.call_type} 
                      status={c.status as any} 
                      durationSeconds={c.duration_seconds} 
                      onCallBack={() => friend && startCall({ calleeId: friend.id, kind: c.call_type, peer: { name: friendDisplayName, avatar: friend.avatar_url }, context: "friend" })}
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

            return (
              <MessageItem
                key={m.id}
                m={m}
                meId={meId}
                friend={friend}
                friendDisplayName={friendDisplayName}
                isLastMine={isLastMine}
                isMatch={isMatch}
                isActiveMatch={isActiveMatch}
                selectionMode={selectionMode}
                isSelected={selectedMsgs.has(m.id)}
                showTime={showTime}
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
                highlight={highlight}
                searchQuery={searchQuery}
                scrollToMessage={scrollToMessage}
              />
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
        <div className="px-4 py-2 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground reply-preview-enter animate-in slide-in-from-bottom-2 duration-200">
          <div className="truncate flex-1">
            <span className="font-bold text-primary block text-[10px] uppercase">Replying to {replyingTo.sender_id === meId ? "yourself" : friendDisplayName}</span>
            <span className="truncate block italic">{replyingTo.content || "Media / Attachment"}</span>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)} className="h-6 w-6 rounded-full hover:bg-secondary flex items-center justify-center ml-2 shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {friendId.startsWith("system-") ? (
        <div className="relative px-4 py-4 border-t border-border flex flex-col gap-2 bg-card shrink-0 text-center items-center" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="bg-secondary/40 border border-border/60 rounded-xl p-4 w-full max-w-lg text-xs text-muted-foreground flex flex-col items-center gap-2 shadow-xs">
            <Megaphone className="h-5 w-5 text-primary" />
            <p className="font-semibold text-foreground">Official Read-Only Channel</p>
            <p className="max-w-md">Only administrators can send messages in this conversation. This channel is used for official announcements and important platform information.</p>
          </div>
        </div>
      ) : selectionMode ? (
        <div className="p-3 border-t border-border flex items-center justify-center bg-card">
          <button
            type="button"
            disabled={selectedMsgs.size === 0}
            onClick={() => setShowDeleteBottomSheet(true)}
            className="w-full max-w-md py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-bold rounded-xl text-sm transition-colors text-center shadow-md"
          >
            Delete ({selectedMsgs.size})
          </button>
        </div>
      ) : (
        <form
          onSubmit={send}
          className="relative px-4 py-3 border-t border-border flex items-center gap-2 bg-card shrink-0"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50 transition-colors" aria-label="Send image">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
          <VoiceRecorder onRecorded={onVoice} uploading={recUploading} />
          <button type="button" onClick={() => setShowEmoji((v) => !v)}
            className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center hover:bg-secondary transition-colors ${showEmoji ? "text-primary" : "text-muted-foreground"}`} aria-label="Emoji">
            <Smile className="h-5 w-5" />
          </button>
          <Input ref={inputRef} value={draft} onChange={(e) => onDraftChange(e.target.value)} placeholder="Aa"
            className="flex-1 min-w-0 h-10 rounded-full bg-secondary border-transparent focus-visible:ring-1 focus-visible:ring-primary/30" />
          <Button type="submit" size="icon" disabled={!draft.trim() || sending} className="h-10 w-10 rounded-full shrink-0 flex items-center justify-center send-btn-active bg-primary text-primary-foreground hover:bg-primary/95 transition-all">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}

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
                    className="p-3 bg-secondary/30 hover:bg-secondary/60 border border-border rounded-xl transition-colors flex flex-col gap-1.5 relative group"
                  >
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-bold text-primary cursor-pointer" onClick={() => { scrollToMessage(m.id); setShowAllPins(false); }}>
                        {m.sender_id === meId ? "You" : friendDisplayName}
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
      {/* Delete Confirmation Bottom Sheet */}
      {showDeleteBottomSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowDeleteBottomSheet(false)} />
          <div className="relative bg-card border-t border-border w-full max-w-md rounded-t-2xl shadow-2xl p-4 flex flex-col gap-2.5 animate-in slide-in-from-bottom duration-300 z-10">
            <div className="text-center text-xs text-muted-foreground font-medium py-1.5 border-b border-border/50">
              Delete {selectedMsgs.size} message{selectedMsgs.size > 1 ? "s" : ""}?
            </div>
            
            {allSelectedAreMine && (
              <button
                type="button"
                onClick={async () => {
                  setShowDeleteBottomSheet(false);
                  const targetIds = Array.from(selectedMsgs);
                  setSelectionMode(false);
                  setSelectedMsgs(new Set());
                  
                  try {
                    await unsendMessagesServer({ data: { ids: targetIds } });
                    setMessages(prev => prev.map(m => targetIds.includes(m.id) ? { ...m, content: "[system:unsent]", image_url: null, audio_url: null } : m));
                    toast.success(`${targetIds.length} message${targetIds.length > 1 ? "s" : ""} deleted for everyone`);
                  } catch (e: any) {
                    toast.error(e?.message || "Could not unsend message");
                  }
                }}
                className="w-full py-3 bg-red-600/10 hover:bg-red-600/20 text-red-500 font-bold rounded-xl text-sm transition-colors text-center"
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
              className="w-full py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-xl text-sm transition-colors text-center"
            >
              Delete for you
            </button>
            
            <button
              type="button"
              onClick={() => setShowDeleteBottomSheet(false)}
              className="w-full py-3 bg-secondary hover:bg-secondary/80 text-muted-foreground font-semibold rounded-xl text-sm transition-colors text-center border border-border"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Desktop Detail Sidebar */}
      {showDetail && (
        <aside className="w-80 border-l border-border bg-card hidden lg:flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200 shrink-0">
          <ConversationDetailPanel friend={friend} pinnedMessages={pinnedMessages} onClose={() => setShowDetail(false)} />
        </aside>
      )}

      {/* Mobile/Tablet Detail Sheet */}
      <Sheet open={showDetail && isMobile} onOpenChange={setShowDetail}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 lg:hidden bg-card border-l border-border text-foreground">
          <ConversationDetailPanel friend={friend} pinnedMessages={pinnedMessages} onClose={() => setShowDetail(false)} />
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
    </div>
  );
}

export function ConversationDetailPanel({ 
  friend, 
  pinnedMessages = [], 
  onClose 
}: { 
  friend: Profile | null; 
  pinnedMessages?: any[]; 
  onClose?: () => void 
}) {
  const [notif, setNotif] = useState(true);
  const [totalFriends, setTotalFriends] = useState<number | null>(null);

  useEffect(() => {
    if (!friend?.id) return;
    supabase
      .from("friendships")
      .select("user_a, user_b", { count: "exact", head: true })
      .or(`user_a.eq.${friend.id},user_b.eq.${friend.id}`)
      .then(({ count }) => {
        setTotalFriends(count ?? 0);
      });
  }, [friend?.id]);

  if (!friend) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-muted-foreground select-none">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = friend.first_name ? (friend.last_name ? `${friend.first_name} ${friend.last_name}` : friend.first_name) : friend.username;

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

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
          <div className="mb-3">
            <Avatar name={friend.username} url={friend.avatar_url} size={80} />
          </div>
          <p className="font-bold text-lg">{displayName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">@{friend.username}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {friend.online ? "Active now" : "Offline"}
          </p>
        </div>

        {/* Contact Info */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold px-2">Contact Info</p>
          <div className="bg-secondary/40 border border-border/50 rounded-2xl p-4 space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Phone</span>
              <p className="text-sm font-semibold text-foreground break-words">{friend.phone || "Not specified"}</p>
            </div>
            <div className="space-y-1 pt-1.5 border-t border-border/40">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Address</span>
              <p className="text-sm font-semibold text-foreground break-words">{friend.address || "Not specified"}</p>
            </div>
          </div>
        </div>

        {/* Profile Info */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold px-2">Profile Details</p>
          <div className="bg-secondary/40 border border-border/50 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Friend Code</span>
              <button 
                onClick={() => friend.friend_code && handleCopy(friend.friend_code, "Friend code")} 
                className="font-mono font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
              >
                <span>{friend.friend_code || "—"}</span>
                {friend.friend_code && <Copy className="h-3 w-3" />}
              </button>
            </div>
            <div className="flex justify-between items-center text-sm pt-2 border-t border-border/40">
              <span className="text-muted-foreground">Total Friends</span>
              <span className="font-bold text-foreground">{totalFriends !== null ? totalFriends : "..."}</span>
            </div>
            {friend.created_at && (
              <div className="flex justify-between items-center text-sm pt-2 border-t border-border/40">
                <span className="text-muted-foreground">Member Since</span>
                <span className="font-medium text-foreground">{new Date(friend.created_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
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
                    {m.sender_id === m.receiver_id ? "System" : m.sender_id === m.receiver_id ? "Other" : "Message"}
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

interface MessageItemProps {
  m: any;
  meId: string | null;
  friend: Profile | null;
  friendDisplayName: string;
  isLastMine: boolean;
  isMatch: boolean;
  isActiveMatch: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  showTime: boolean;
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
  highlight: (text: string, query: string) => React.ReactNode;
  searchQuery: string;
  scrollToMessage: (id: string) => void;
}

const MessageItem = React.memo(function MessageItem({
  m,
  meId,
  friend,
  friendDisplayName,
  isLastMine,
  isMatch,
  isActiveMatch,
  selectionMode,
  isSelected,
  showTime,
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
  highlight,
  searchQuery,
  scrollToMessage,
}: MessageItemProps) {
  const mine = m.sender_id === meId;
  const reactionKeys = Object.keys(m.reactions || {}).filter(k => m.reactions[k].length > 0);

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
        {mine ? "You pinned a message" : `${friendDisplayName} pinned a message`}
      </div>
    );
  }

  if (m.isSystemUnpin) {
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic flex items-center justify-center gap-1">
        <Pin className="h-3 w-3 rotate-45 text-muted-foreground/40" />
        {mine ? "You unpinned a message" : `${friendDisplayName} unpinned a message`}
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
              onClick={() => scrollToMessage(m.replyTo.id)}
              className="max-w-[60%] text-[10px] bg-secondary/80 hover:bg-secondary border border-border/60 rounded-2xl px-3 py-1 text-muted-foreground truncate cursor-pointer transition-colors"
            >
              <span className="font-bold text-primary block text-[8px] uppercase tracking-wider">Replying to {m.replyTo.senderName}</span>
              <span className="italic truncate block">{m.replyTo.text}</span>
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
          >
            {m.image_url ? (
              <button onClick={() => onPreviewImage(toCDNUrl(m.image_url))} className="max-w-[200px] rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary block">
                <img src={toCDNUrl(m.image_url)} alt="" className="block max-h-80 w-auto object-cover" />
              </button>
            ) : m.audio_url ? (
              <div className="block">
                <VoiceMessage src={toCDNUrl(m.audio_url)} mine={mine} />
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

        {mine && (isLastMine || m.failed) && (
          <div className="flex items-center justify-end gap-1.5 pr-2 pt-1 min-h-5 text-[11px] font-medium leading-none text-message-status">
            {m.failed ? (
              <span className="inline-flex items-center gap-1 text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                Not delivered
              </span>
            ) : (m.id && typeof m.id === "string" && m.id.startsWith("temp-")) ? (
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
    </div>
  );
});

