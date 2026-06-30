import React, { useEffect, useState, useRef } from "react";
import { createFileRoute, Link, Outlet, useParams, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Input } from "@/components/ui/input";
import { Search, MessageCircle, Sparkles, Ban, RotateCcw, Plus, Pin, Loader2, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "@/components/messenger/Avatar";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { PullToRefresh } from "@/components/messenger/PullToRefresh";
import { motion, AnimatePresence } from "framer-motion";
import { prefetchConversation } from "@/lib/chat-cache";

export const Route = createFileRoute("/app/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Chats — JJ Messenger" }] }),
  component: ChatLayout,
});

type Conversation = {
  friendId: string;
  username: string;
  displayName: string;
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
  const [spammedByIds, setSpammedByIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"all" | "spam">("all");
  const [pageUnread, setPageUnread] = useState(0);
  const [pageLast, setPageLast] = useState<{ content: string | null; at: string | null }>({ content: null, at: null });
  const [search, setSearch] = useState("");
  const [meId, setMeId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [chosenUsername, setChosenUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const params = useParams({ strict: false }) as { friendId?: string };
  const location = useLocation();
  const activeId = params.friendId;
  const isPageActive = location.pathname.endsWith("/chat/page");
  const { isAdmin } = useRole();
  const hasActive = !!activeId || isPageActive;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function loadSpam(myId: string) {
    const [{ data: outgoing }, { data: incoming }] = await Promise.all([
      supabase.from("spam_list").select("spammed_user_id").eq("user_id", myId),
      supabase.from("spam_list").select("user_id").eq("spammed_user_id", myId),
    ]);
    setSpamIds(new Set((outgoing ?? []).map((r: any) => r.spammed_user_id)));
    setSpammedByIds(new Set((incoming ?? []).map((r: any) => r.user_id)));
  }

  async function loadPage(myId: string) {
    const { data: conv } = await supabase
      .from("page_conversations")
      .select("id")
      .eq("user_id", myId)
      .maybeSingle();
    if (!conv) return;

    const [{ data: last }, { data: lastCalls }] = await Promise.all([
      supabase
        .from("page_messages")
        .select("id, content, created_at, from_page, seen, image_url, audio_url")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("calls")
        .select("id, caller_id, callee_id, call_type, status, created_at")
        .in("context", ["page", "page_broadcast"])
        .or(`caller_id.eq.${myId},callee_id.eq.${myId}`)
        .order("created_at", { ascending: false })
        .limit(10)
    ]);

    const deletedIds = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
    const deletedSet = new Set<string>(deletedIds);
    const arr = (last ?? []).filter((m) => !deletedSet.has(m.id));
    const firstMsg = arr[0];
    const firstCall = lastCalls?.[0];

    let content = firstMsg?.content ?? null;
    let at = firstMsg?.created_at ?? null;

    if (content?.startsWith("[system:reaction:")) {
      content = "Reacted to a message";
    } else if (content?.startsWith("[system:pin:")) {
      content = "Pinned a message";
    } else if (content?.startsWith("[system:unpin:")) {
      content = "Unpinned a message";
    } else if (content?.startsWith("[system:unsent]")) {
      content = "Unsent a message";
    } else if (content?.startsWith("[system:forwarded] ")) {
      content = content.slice("[system:forwarded] ".length);
    } else if (content?.startsWith("[system:forwarded]")) {
      content = content.slice("[system:forwarded]".length).trim() || (firstMsg?.image_url ? "📷 Photo" : firstMsg?.audio_url ? "🎤 Voice message" : "Forwarded message");
    } else if (content === "[system:forwarded]") {
      content = firstMsg?.image_url ? "📷 Photo" : firstMsg?.audio_url ? "🎤 Voice message" : "Forwarded message";
    } else if (content?.startsWith("[reply:")) {
      const match = content.match(/^\[reply:[^\]]+\]\s*([\s\S]*)/);
      if (match) content = match[1];
    }

    if (firstCall && (!at || new Date(firstCall.created_at) > new Date(at))) {
      content = firstCall.call_type === "video" ? "📹 Video call" : "📞 Voice call";
      at = firstCall.created_at;
    }

    setPageLast({ content, at });
    setPageUnread(arr.filter((m) => m.from_page && !m.seen).length);
  }

  async function load(myId: string) {
    const { data: friends } = await supabase
      .from("friendships")
      .select("user_a, user_b");
    if (!friends) return;
    const friendIds = friends.map((f) => (f.user_a === myId ? f.user_b : f.user_a));
    if (friendIds.length === 0) { setConversations([]); return; }

    const [{ data: profiles }, { data: msgs }, { data: friendCalls }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, first_name, last_name, avatar_url, online")
        .in("id", friendIds),
      supabase
        .from("messages")
        .select("id, sender_id, receiver_id, content, image_url, audio_url, created_at, seen")
        .or(friendIds.map((id) => `and(sender_id.eq.${id},receiver_id.eq.${myId}),and(sender_id.eq.${myId},receiver_id.eq.${id})`).join(","))
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("calls")
        .select("id, caller_id, callee_id, call_type, status, created_at")
        .eq("context", "friend")
        .or(`caller_id.eq.${myId},callee_id.eq.${myId}`)
        .order("created_at", { ascending: false })
        .limit(200)
    ]);

    const deletedIds = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
    const deletedSet = new Set<string>(deletedIds);

    const byFriend: Record<string, Conversation> = {};
    (profiles ?? []).forEach((p) => {
      const displayName = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.username;
      byFriend[p.id] = { 
        friendId: p.id, 
        username: p.username, 
        displayName,
        avatar_url: p.avatar_url, 
        online: p.online, 
        lastMessage: null, 
        lastAt: null, 
        unread: 0, 
        allText: "" 
      };
    });
    const filteredMsgs = (msgs ?? []).filter((m) => !deletedSet.has(m.id));
    filteredMsgs.forEach((m: any) => {
      const fid = m.sender_id === myId ? m.receiver_id : m.sender_id;
      const c = byFriend[fid];
      if (!c) return;
      let preview = m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : m.content;
      if (preview?.startsWith("[system:reaction:")) {
        preview = "Reacted to a message";
      } else if (preview?.startsWith("[system:pin:")) {
        preview = "Pinned a message";
      } else if (preview?.startsWith("[system:unpin:")) {
        preview = "Unpinned a message";
      } else if (preview?.startsWith("[system:unsent]")) {
        preview = "Unsent a message";
      } else if (preview?.startsWith("[system:forwarded] ")) {
        preview = preview.slice("[system:forwarded] ".length);
      } else if (preview?.startsWith("[system:forwarded]")) {
        preview = preview.slice("[system:forwarded]".length).trim() || (m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : "Forwarded message");
      } else if (preview === "[system:forwarded]") {
        preview = m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : "Forwarded message";
      } else if (preview?.startsWith("[reply:")) {
        const match = preview.match(/^\[reply:[^\]]+\]\s*([\s\S]*)/);
        if (match) preview = match[1];
      }
      if (!c.lastAt) { c.lastMessage = preview; c.lastAt = m.created_at; }
      if (m.content) c.allText += " " + m.content.toLowerCase();
      if (m.receiver_id === myId && !m.seen) c.unread++;
    });

    // Merge recent calls into friendship items
    (friendCalls ?? []).forEach((call: any) => {
      const fid = call.caller_id === myId ? call.callee_id : call.caller_id;
      if (!fid) return;
      const c = byFriend[fid];
      if (!c) return;

      const callPreview = call.call_type === "video" ? "📹 Video call" : "📞 Voice call";
      if (!c.lastAt || new Date(call.created_at) > new Date(c.lastAt)) {
        c.lastMessage = callPreview;
        c.lastAt = call.created_at;
      }
    });

    setConversations(Object.values(byFriend).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")));
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user && mounted) {
        setMeId(u.user.id);
        setCurrentUser(u.user);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const isGoogle = currentUser.app_metadata?.provider === "google" || currentUser.identities?.some((id: any) => id.provider === "google");
    const onboarded = currentUser.user_metadata?.username_onboarded;
    if (isGoogle && !onboarded) {
      setShowOnboarding(true);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!showOnboarding) return;
    const trimmed = chosenUsername.trim();
    if (trimmed.length === 0) {
      setUsernameError("");
      return;
    }
    if (trimmed.length < 3) {
      setUsernameError("Username must be at least 3 characters.");
      return;
    }
    if (trimmed.length > 20) {
      setUsernameError("Username must be under 20 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameError("Letters, numbers, and underscores only.");
      return;
    }

    setCheckingUsername(true);
    const delay = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", trimmed)
          .maybeSingle();
        
        if (error) throw error;
        if (data && data.id !== meId) {
          setUsernameError("Username is already taken.");
        } else {
          setUsernameError("");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setCheckingUsername(false);
      }
    }, 400);

    return () => clearTimeout(delay);
  }, [chosenUsername, showOnboarding, meId]);

  async function handleSaveUsername() {
    const trimmed = chosenUsername.trim();
    if (usernameError || !trimmed || !meId) return;
    setSavingUsername(true);
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ username: trimmed })
        .eq("id", meId);
      
      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({
        data: { username_onboarded: true }
      });
      if (authError) throw authError;

      toast.success("Username set successfully!");
      setShowOnboarding(false);
    } catch (err: any) {
      toast.error(err.message ?? "Could not save username.");
    } finally {
      setSavingUsername(false);
    }
  }

  async function handleSkipUsername() {
    setSavingUsername(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({
        data: { username_onboarded: true }
      });
      if (authError) throw authError;

      toast.success("Skipped onboarding");
      setShowOnboarding(false);
    } catch (err: any) {
      toast.error(err.message ?? "Could not skip onboarding.");
    } finally {
      setSavingUsername(false);
    }
  }

  useEffect(() => {
    if (!meId) return;
    let mounted = true;

    load(meId);
    loadPage(meId);
    loadSpam(meId);

    const channel = supabase
      .channel("conv-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        if (!mounted) return;
        const m = payload.new as any;
        if (!m || !m.sender_id || !m.receiver_id) return;
        const isMine = m.sender_id === meId;
        const friendId = isMine ? m.receiver_id : m.sender_id;

        if (payload.eventType === "INSERT") {
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.friendId === friendId);
            if (idx === -1) {
              // New chat/relationship, load from DB to fetch profile and metadata
              load(meId);
              return prev;
            }
            
            let preview = m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : m.content;
            if (preview?.startsWith("[system:reaction:")) {
              preview = "Reacted to a message";
            } else if (preview?.startsWith("[system:pin:")) {
              preview = "Pinned a message";
            } else if (preview?.startsWith("[system:unpin:")) {
              preview = "Unpinned a message";
            } else if (preview?.startsWith("[system:unsent]")) {
              preview = "Unsent a message";
            } else if (preview?.startsWith("[system:forwarded] ")) {
              preview = preview.slice("[system:forwarded] ".length);
            } else if (preview?.startsWith("[system:forwarded]")) {
              preview = preview.slice("[system:forwarded]".length).trim() || (m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : "Forwarded message");
            } else if (preview === "[system:forwarded]") {
              preview = m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : "Forwarded message";
            } else if (preview?.startsWith("[reply:")) {
              const match = preview.match(/^\[reply:[^\]]+\]\s*([\s\S]*)/);
              if (match) preview = match[1];
            }

            const updated = { ...prev[idx] };
            updated.lastMessage = preview;
            updated.lastAt = m.created_at;
            if (m.content) updated.allText += " " + m.content.toLowerCase();
            if (m.receiver_id === meId && !m.seen) {
              updated.unread += 1;
            }

            const next = prev.filter((_, i) => i !== idx);
            next.push(updated);
            return next.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
          });
        } else if (payload.eventType === "UPDATE") {
          if (m.receiver_id === meId && m.seen) {
            setConversations((prev) =>
              prev.map((c) => (c.friendId === friendId ? { ...c, unread: 0 } : c))
            );
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        if (mounted) load(meId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "page_messages" }, (payload) => {
        if (!mounted) return;
        const m = payload.new as any;
        if (!m) return;
        if (payload.eventType === "INSERT") {
          let preview = m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : m.content;
          if (preview?.startsWith("[system:reaction:")) {
            preview = "Reacted to a message";
          } else if (preview?.startsWith("[system:pin:")) {
            preview = "Pinned a message";
          } else if (preview?.startsWith("[system:unpin:")) {
            preview = "Unpinned a message";
          } else if (preview?.startsWith("[system:unsent]")) {
            preview = "Unsent a message";
          } else if (preview?.startsWith("[system:forwarded] ")) {
            preview = preview.slice("[system:forwarded] ".length);
          } else if (preview?.startsWith("[system:forwarded]")) {
            preview = preview.slice("[system:forwarded]".length).trim() || (m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : "Forwarded message");
          } else if (preview === "[system:forwarded]") {
            preview = m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : "Forwarded message";
          } else if (preview?.startsWith("[reply:")) {
            const match = preview.match(/^\[reply:[^\]]+\]\s*([\s\S]*)/);
            if (match) preview = match[1];
          }

          setPageLast({ content: preview, at: m.created_at });
          if (m.from_page && !m.seen) {
            setPageUnread((prev) => prev + 1);
          }
        } else if (payload.eventType === "UPDATE") {
          if (m.from_page && m.seen) {
            setPageUnread(0);
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "spam_list" }, () => {
        if (mounted) loadSpam(meId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (payload) => {
        if (!mounted) return;
        const c = payload.new as any;
        if (!c) return;
        
        const callPreview = c.call_type === "video" ? "📹 Video call" : "📞 Voice call";

        if (c.context === "page" || c.context === "page_broadcast") {
          setPageLast((prev) => {
            if (!prev.at || new Date(c.created_at) > new Date(prev.at)) {
              return { content: callPreview, at: c.created_at };
            }
            return prev;
          });
        } else if (c.context === "friend") {
          const friendId = c.caller_id === meId ? c.callee_id : c.caller_id;
          if (!friendId) return;

          setConversations((prev) => {
            const idx = prev.findIndex((item) => item.friendId === friendId);
            if (idx === -1) return prev;

            const updated = { ...prev[idx] };
            if (!updated.lastAt || new Date(c.created_at) > new Date(updated.lastAt)) {
              updated.lastMessage = callPreview;
              updated.lastAt = c.created_at;
            }

            const next = prev.filter((_, i) => i !== idx);
            next.push(updated);
            return next.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
          });
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [meId]);

  useEffect(() => {
    function handleSent(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.friendId === detail.receiverId);
        if (idx === -1) return prev;
        let preview = detail.content;
        if (!preview) {
          preview = detail.image_url ? "📷 Photo" : detail.audio_url ? "🎤 Voice message" : "Message";
        }
        const updated = { ...prev[idx], lastMessage: preview, lastAt: detail.created_at || new Date().toISOString() };
        const copy = prev.filter((_, i) => i !== idx);
        return [updated, ...copy].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
      });
    }
    window.addEventListener("jj-message-sent", handleSent);
    return () => window.removeEventListener("jj-message-sent", handleSent);
  }, []);

  // Optimistically clear unread badges for active chats
  useEffect(() => {
    if (activeId) {
      setConversations((prev) =>
        prev.map((c) => (c.friendId === activeId ? { ...c, unread: 0 } : c))
      );
    }
  }, [activeId]);

  useEffect(() => {
    if (isPageActive) {
      setPageUnread(0);
    }
  }, [isPageActive]);

  async function toggleSpam(e: React.MouseEvent, friendId: string, isSpam: boolean) {
    e.preventDefault();
    e.stopPropagation();
    if (!meId) return;
    if (isSpam) {
      const { error } = await supabase.from("spam_list").delete().eq("user_id", meId).eq("spammed_user_id", friendId);
      if (error) toast.error("Could not unspam"); else { toast.success("Removed from spam"); setSpamIds((s) => { const n = new Set(s); n.delete(friendId); return n; }); }
    } else {
      const { error } = await supabase.from("spam_list").insert({ user_id: meId, spammed_user_id: friendId });
      if (error) toast.error("Could not mark as spam"); else { toast.success("Moved to spam"); setSpamIds((s) => new Set(s).add(friendId)); }
    }
  }

  const [pinnedFriends, setPinnedFriends] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("jj_pinned_friends");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [contextMenuTarget, setContextMenuTarget] = useState<string | null>(null);
  const touchTimerRef = useRef<any>(null);

  const startTouch = (friendId: string) => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => {
      setContextMenuTarget(friendId);
    }, 600);
  };

  const endTouch = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const togglePin = (friendId: string) => {
    let next: string[];
    if (pinnedFriends.includes(friendId)) {
      next = pinnedFriends.filter(id => id !== friendId);
      toast.success("Chat unpinned");
    } else {
      next = [...pinnedFriends, friendId];
      toast.success("Chat pinned to top");
    }
    setPinnedFriends(next);
    localStorage.setItem("jj_pinned_friends", JSON.stringify(next));
  };

  const q = search.trim().toLowerCase();
  const visible = conversations.filter((c) => (tab === "spam" ? spamIds.has(c.friendId) : !spamIds.has(c.friendId)));
  const filtered = visible.filter((c) =>
    !q || c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q) || c.allText.includes(q)
  );
  const spamCount = conversations.filter((c) => spamIds.has(c.friendId)).length;

  const onlineFriends = conversations.filter((c) => c.online && !spamIds.has(c.friendId));

  const sorted = [...filtered].sort((a, b) => {
    const aPinned = pinnedFriends.includes(a.friendId);
    const bPinned = pinnedFriends.includes(b.friendId);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  return (
    <AppShell>
      <div className="flex h-full w-full overflow-hidden bg-background">
        <motion.div
          animate={isMobile ? { x: hasActive ? "-100vw" : "0vw" } : { x: "0px" }}
          transition={{ type: "spring", damping: 26, stiffness: 240 }}
          className="flex h-full w-[200vw] md:w-full shrink-0 md:shrink"
        >
          {/* Sidebar Panel */}
          <div className="w-[100vw] md:w-full md:max-w-sm md:border-r md:border-border flex flex-col min-h-0 shrink-0">
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
            {tab === "all" && (
              <div className="flex items-center gap-4 py-2 mt-3 overflow-x-auto no-scrollbar">
                {/* Create story / Self placeholder */}
                <div className="flex flex-col items-center shrink-0 w-[60px] text-center">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full bg-secondary hover:bg-secondary/85 flex items-center justify-center border border-border cursor-pointer transition-colors">
                      <Plus className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 truncate w-full">Create story</span>
                </div>
                {/* Online friends */}
                {onlineFriends.map((f) => (
                  <Link
                    key={f.friendId}
                    to="/app/chat/$friendId"
                    params={{ friendId: f.friendId }}
                    className="flex flex-col items-center shrink-0 w-[60px] text-center group cursor-pointer"
                  >
                    <div className="relative">
                      <Avatar name={f.displayName} url={f.avatar_url} size={48} />
                      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-green-500 ring-2 ring-background" />
                    </div>
                    <span className="text-[10px] font-medium text-foreground mt-1 truncate w-full group-hover:underline">
                      {f.displayName.split(" ")[0]}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setTab("all")}
                className={`flex-1 text-sm font-semibold py-1.5 rounded-full transition-colors ${tab === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
              >
                All
              </button>
              <button
                onClick={() => setTab("spam")}
                className={`flex-1 text-sm font-semibold py-1.5 rounded-full transition-colors flex items-center justify-center gap-1.5 ${tab === "spam" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
              >
                <Ban className="h-3.5 w-3.5" /> Spam{spamCount > 0 ? ` (${spamCount})` : ""}
              </button>
            </div>
          </div>
          <PullToRefresh onRefresh={async () => { if (meId) { await Promise.all([load(meId), loadPage(meId), loadSpam(meId)]); } }}>
            {!isAdmin && tab === "all" && (
              <Link
                to="/app/chat/page"
                className={`flex items-center gap-3 px-3 py-3 mx-2 my-1 rounded-xl hover:bg-secondary transition-colors ${isPageActive ? "bg-secondary" : ""}`}
              >
                <div className="relative shrink-0">
                  <img src="/icons/icon-256.webp" alt="Logo" className="h-12 w-12 rounded-full object-cover border border-border/20" />
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />
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
                    {pageLast.content ?? "Official page · We reply within minutes"}
                  </p>
                </div>
                {pageUnread > 0 && <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-[10px] text-primary-foreground font-bold flex items-center justify-center shrink-0">{pageUnread}</span>}
              </Link>
            )}

            {sorted.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {tab === "spam"
                  ? "No spam conversations."
                  : conversations.length === 0
                  ? "Add a friend with their friend code to chat 1-on-1."
                  : "No matches."}
              </div>
            ) : (
              sorted.map((c) => (
                <ConversationItem
                  key={c.friendId}
                  c={c}
                  isSpam={spamIds.has(c.friendId)}
                  isPinned={pinnedFriends.includes(c.friendId)}
                  isActive={activeId === c.friendId}
                  meId={meId}
                  isSpammedBy={spammedByIds.has(c.friendId)}
                  startTouch={startTouch}
                  endTouch={endTouch}
                  setContextMenuTarget={setContextMenuTarget}
                  toggleSpam={toggleSpam}
                />
              ))
            )}
          </PullToRefresh>
          </div>
          {/* Active Chat Panel */}
          <div className="w-[100vw] md:flex-1 flex flex-col min-h-0 shrink-0 md:shrink">
            {hasActive ? <Outlet /> : <EmptyState />}
          </div>
        </motion.div>
      </div>

      {contextMenuTarget && (() => {
        const targetFriend = conversations.find(c => c.friendId === contextMenuTarget);
        if (!targetFriend) return null;
        const isPinned = pinnedFriends.includes(contextMenuTarget);
        const isSpam = spamIds.has(contextMenuTarget);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setContextMenuTarget(null)} />
            <div className="relative w-full max-w-[280px] bg-card border border-border rounded-2xl shadow-2xl p-4 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center pb-3 border-b border-border">
                <Avatar name={targetFriend.username} url={targetFriend.avatar_url} size={56} />
                <h3 className="font-bold text-base mt-2 text-foreground truncate w-full">{targetFriend.username}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Manage chat options</p>
              </div>
              <div className="py-2 space-y-1">
                <button
                  onClick={() => {
                    togglePin(contextMenuTarget);
                    setContextMenuTarget(null);
                  }}
                  className="w-full h-11 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                >
                  <Pin className="h-4 w-4 shrink-0 text-primary rotate-45 fill-primary" />
                  <span>{isPinned ? "Unpin chat" : "Pin chat"}</span>
                </button>
                <button
                  onClick={async (e) => {
                    await toggleSpam(e, contextMenuTarget, isSpam);
                    setContextMenuTarget(null);
                  }}
                  className="w-full h-11 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-destructive transition-colors"
                >
                  <Ban className="h-4 w-4 shrink-0 text-destructive" />
                  <span>{isSpam ? "Remove from spam" : "Move to spam"}</span>
                </button>
                <button
                  onClick={() => setContextMenuTarget(null)}
                  className="w-full h-11 px-3 rounded-lg flex items-center justify-center text-sm font-semibold hover:bg-secondary text-muted-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Google Username Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-none"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-sm bg-card border border-border rounded-3xl shadow-2xl p-6 flex flex-col gap-4 text-foreground z-10"
            >
              <div className="text-center space-y-1.5">
                <h3 className="font-bold text-lg text-foreground flex items-center justify-center gap-1.5">
                  Choose Your Username
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed px-1">
                  Your Google account is connected successfully. Please choose a unique username.
                </p>
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <Input
                    placeholder="Username"
                    value={chosenUsername}
                    onChange={(e) => setChosenUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                    disabled={savingUsername}
                    className="h-11 rounded-xl bg-background/50 border-border/80 focus:ring-primary/20"
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center">
                    {checkingUsername && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {!checkingUsername && chosenUsername.trim().length >= 3 && !usernameError && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {!checkingUsername && chosenUsername.trim().length >= 3 && usernameError && (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                </div>

                {usernameError && (
                  <p className="text-[11px] text-destructive font-medium px-1.5">{usernameError}</p>
                )}
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleSkipUsername}
                  disabled={savingUsername}
                  className="flex-1 h-11 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors border border-border"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={handleSaveUsername}
                  disabled={savingUsername || checkingUsername || !!usernameError || chosenUsername.trim().length < 3}
                  className="flex-1 h-11 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  {savingUsername && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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

const ConversationItem = React.memo(function ConversationItem({
  c,
  isSpam,
  isPinned,
  isActive,
  meId,
  isSpammedBy,
  startTouch,
  endTouch,
  setContextMenuTarget,
  toggleSpam,
}: {
  c: Conversation;
  isSpam: boolean;
  isPinned: boolean;
  isActive: boolean;
  meId: string | null;
  isSpammedBy: boolean;
  startTouch: (id: string) => void;
  endTouch: () => void;
  setContextMenuTarget: (id: string) => void;
  toggleSpam: (e: React.MouseEvent, id: string, isSpam: boolean) => void;
}) {
  return (
    <div className="group relative">
      <Link
        to="/app/chat/$friendId"
        params={{ friendId: c.friendId }}
        onPointerDown={() => {
          startTouch(c.friendId);
          if (meId) prefetchConversation(meId, c.friendId);
        }}
        onMouseEnter={() => {
          if (meId) prefetchConversation(meId, c.friendId);
        }}
        onPointerUp={endTouch}
        onPointerMove={endTouch}
        onPointerLeave={endTouch}
        onContextMenu={(e) => { e.preventDefault(); setContextMenuTarget(c.friendId); }}
        className={`flex items-center gap-3 px-3 py-3 mx-2 my-1 rounded-xl hover:bg-secondary transition-colors select-none ${isActive ? "bg-secondary" : ""}`}
      >
        <div className="relative shrink-0">
          <Avatar name={c.displayName} url={c.avatar_url} />
          {c.online && !isSpam && !isSpammedBy && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
        </div>
        <div className="flex-1 min-w-0 pr-10">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`truncate text-sm flex items-center gap-1.5 ${c.unread > 0 ? "font-bold" : "font-semibold"}`}>
              {c.displayName}
              {isPinned && <Pin className="h-3.5 w-3.5 text-primary rotate-45 fill-primary shrink-0" />}
            </p>
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
      <button
        onClick={(e) => toggleSpam(e, c.friendId, isSpam)}
        title={isSpam ? "Remove from spam" : "Move to spam"}
        aria-label={isSpam ? "Remove from spam" : "Move to spam"}
        className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background border border-border items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex md:opacity-0 md:group-hover:opacity-100"
        style={isSpam ? { opacity: 1 } : undefined}
      >
        {isSpam ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
      </button>
    </div>
  );
});
