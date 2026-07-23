import React, { useEffect, useState, useRef } from "react";
import { createFileRoute, Link, Outlet, useParams, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatSystemMessage, isSystemMessage } from "@/lib/chat-helpers";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Input } from "@/components/ui/input";
import { Search, MessageCircle, Sparkles, Ban, RotateCcw, Plus, Pin, Loader2, Check, X, BookOpen, Megaphone, Users, Trophy, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "@/components/messenger/Avatar";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { PullToRefresh } from "@/components/messenger/PullToRefresh";
import { motion, AnimatePresence } from "framer-motion";
import { prefetchConversation } from "@/lib/chat-cache";
import {
  shouldFullRebuildInbox,
  setInboxSyncedAt,
  getInboxSyncedAt,
  fetchInboxDeltaPatches,
  persistInboxCache,
} from "@/lib/inbox-sync";
import { NetworkManager } from "@/lib/network-manager";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getUserVipDashboardStats } from "@/lib/api/vip-reward-engine/dashboard.functions";
import { useServerFn } from "@tanstack/react-start";
import { ChatListSkeleton } from "@/components/messenger/ChatListSkeleton";
import { signalShellReady } from "@/lib/shell-ready";


function getVipBadgeUrl(status: string | null | undefined): string | null {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  if (normalized === "platinum") return "/platium.png";
  if (normalized === "diamond") return "/dimond.png";
  if (normalized === "black_diamond" || normalized === "blackvip") return "/blackvip.png";
  return `/${normalized}.png`;
}

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
  vip_status?: string | null;
  isGroup?: boolean;
  groupId?: string;
};

function ChatLayout() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("jj_cached_conversations");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Hydrate / upgrade durable IndexedDB inbox store after mount.
  useEffect(() => {
    void import("@/lib/local-db").then(async ({ localDbGetInbox, localDbSetInbox }) => {
      if (conversations.length > 0) {
        await localDbSetInbox(conversations);
        return;
      }
      const rows = await localDbGetInbox<Conversation>();
      if (rows?.length) setConversations(rows);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cold-start hydrate once
  }, []);
  const [loadingConvs, setLoadingConvs] = useState(() => {
    // Cache hit → no loading gate (Messenger-style instant inbox).
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem("jj_cached_conversations");
      const parsed = stored ? JSON.parse(stored) : [];
      return !(Array.isArray(parsed) && parsed.length > 0);
    } catch {
      return true;
    }
  });

  // Drop native splash as soon as chat chrome is on screen (skeleton OK).
  useEffect(() => {
    signalShellReady();
  }, []);

  const [spamIds, setSpamIds] = useState<Set<string>>(new Set());
  const [spammedByIds, setSpammedByIds] = useState<Set<string>>(new Set());
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get("tab") as any) || "all";
  const [tab, setTab] = useState<"all" | "groups" | "calls" | "spam">(initialTab);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get("tab");
    if (t && ["all", "groups", "calls", "spam"].includes(t)) {
      setTab(t as any);
    } else {
      setTab("all");
    }
  }, [location.search]);

  // VIP dashboard stats & deposit modal states
  const getVipStatsFn = useServerFn(getUserVipDashboardStats);
  const [vipStats, setVipStats] = useState<any>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("jj_cached_my_vip_stats");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [depositOpen, setDepositOpen] = useState(false);
  const [callsLog, setCallsLog] = useState<any[]>([]);

  async function loadVipStats(userId?: string) {
    try {
      const res = await getVipStatsFn();
      if (res?.success) {
        setVipStats(res);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("jj_cached_my_vip_stats", JSON.stringify(res));
            
            const targetUid = userId || meId || localStorage.getItem("jj_me_id");
            if (targetUid) {
              const cachedProfileStr = localStorage.getItem("jj_cached_my_profile");
              const cachedProfile = cachedProfileStr ? JSON.parse(cachedProfileStr) : {};
              const updatedProfile = {
                ...cachedProfile,
                id: targetUid,
                username: res.profile.username || cachedProfile.username,
                vip_status: res.profile.vipStatus || cachedProfile.vip_status,
                wallet_balance: res.profile.walletBalance !== undefined ? res.profile.walletBalance : cachedProfile.wallet_balance,
                credit_balance: res.profile.creditBalance !== undefined ? res.profile.creditBalance : cachedProfile.credit_balance,
              };
              localStorage.setItem("jj_cached_my_profile", JSON.stringify(updatedProfile));
            }
          } catch (cacheErr) {
            console.error("Failed to write to local storage cache:", cacheErr);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load VIP stats in chat view:", e);
    }
  }
  const [pageUnread, setPageUnread] = useState(0);
  const [pageLast, setPageLast] = useState<{ content: string | null; at: string | null }>({ content: null, at: null });
  const [pageConvId, setPageConvId] = useState<string | null>(null);
  const pageConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    pageConvIdRef.current = pageConvId;
  }, [pageConvId]);
  const [search, setSearch] = useState("");
  const [meId, setMeId] = useState<string | null>(null);
  const [systemAnnouncements, setSystemAnnouncements] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [chosenUsername, setChosenUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const params = useParams({ strict: false }) as { friendId?: string };
  const activeId = params.friendId;
  const isPageActive = location.pathname.endsWith("/chat/page");
  const { isAdmin } = useRole();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const hasActive = !!activeId || isPageActive;
  const [isMobile, setIsMobile] = useState(false);

  // One-time mobile check — DO NOT use window resize listener here.
  // On Android/MIUI, soft keyboard open/close fires resize events which
  // trigger setIsMobile state changes and cause full React re-render trees
  // during the keyboard animation, freezing the UI for 1-3 seconds.
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  async function loadSystemAnnouncements() {
    try {
      const { data, error } = await supabase
        .from("system_announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSystemAnnouncements(data || []);
    } catch (e: any) {
      console.error("[System Announcements Fetch Error]:", e.message);
    }
  }

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
    setPageConvId(conv.id);

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

    let deletedIds: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
      deletedIds = Array.isArray(parsed) ? parsed : [];
    } catch {}
    const deletedSet = new Set<string>(deletedIds);
    const arr = (last ?? []).filter((m) => !deletedSet.has(m.id));
    const firstMsg = arr[0];
    const firstCall = lastCalls?.[0];

    let content = firstMsg ? (firstMsg.image_url ? "📷 Photo" : firstMsg.audio_url ? "🎤 Voice message" : firstMsg.content) : null;
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

  async function fetchAndAppendConversation(convoKey: string, msgCreatedAt: string) {
    if (!meId) return;
    try {
      const isGroup = convoKey.startsWith("group-");
      let newConvo: Conversation;

      if (isGroup) {
        const groupId = convoKey.substring(6);
        const { data: grp } = await supabase
          .from("groups")
          .select("id, name, avatar_url, created_at")
          .eq("id", groupId)
          .maybeSingle();
        if (!grp) return;

        newConvo = {
          friendId: convoKey,
          username: grp.name,
          displayName: grp.name,
          avatar_url: grp.avatar_url,
          online: false,
          lastMessage: "Conversation started",
          lastAt: msgCreatedAt || grp.created_at || new Date().toISOString(),
          unread: 0,
          vip_status: "none",
          isGroup: true,
          allText: grp.name.toLowerCase()
        };
      } else {
        const friendId = convoKey;
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, username, first_name, last_name, avatar_url, vip_status, online, last_seen")
          .eq("id", friendId)
          .maybeSingle();
        if (!prof) return;

        const dispName = (prof.first_name || prof.last_name) 
          ? `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() 
          : prof.username;

        newConvo = {
          friendId: convoKey,
          username: prof.username,
          displayName: dispName,
          avatar_url: prof.avatar_url,
          online: prof.online || false,
          lastMessage: "Say hi 👋",
          lastAt: msgCreatedAt || new Date().toISOString(),
          unread: 0,
          vip_status: prof.vip_status || "none",
          isGroup: false,
          allText: prof.username.toLowerCase() + " " + dispName.toLowerCase()
        };
      }

      setConversations((prev) => {
        if (prev.some((c) => c.friendId === convoKey)) return prev;
        const next = [newConvo, ...prev];
        try {
          localStorage.setItem("jj_cached_conversations", JSON.stringify(next));
        } catch {}
        return next.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
      });
    } catch (err) {
      console.error("Error adding new conversation slot:", err);
    }
  }

  async function load(myId: string) {
    try {
      const [friendsRes, membershipsRes] = await Promise.all([
        supabase.from("friendships").select("user_a, user_b"),
        supabase.from("group_members").select("group_id, role, groups(id, name, avatar_url, created_at, created_by)").eq("user_id", myId)
      ]);

      const friends = friendsRes.data ?? [];
      const memberships = membershipsRes.data ?? [];

      const friendIds = friends.map((f) => (f.user_a === myId ? f.user_b : f.user_a));
      const groupIds = memberships.map((m: any) => m.group_id).filter(Boolean);

      if (friendIds.length === 0 && groupIds.length === 0) {
        setConversations([]);
        return;
      }

      const queries = [];
      if (friendIds.length > 0) {
        queries.push(
          supabase
            .from("profiles")
            .select("id, username, first_name, last_name, avatar_url, online, vip_status")
            .in("id", friendIds)
        );
      } else {
        queries.push(Promise.resolve({ data: [] }));
      }

      let orFilterParts = [];
      if (friendIds.length > 0) {
        orFilterParts.push(...friendIds.map((id) => `and(sender_id.eq.${id},receiver_id.eq.${myId}),and(sender_id.eq.${myId},receiver_id.eq.${id})`));
      }
      if (groupIds.length > 0) {
        orFilterParts.push(`group_id.in.(${groupIds.join(",")})`);
      }

      if (orFilterParts.length > 0) {
        queries.push(
          supabase
            .from("messages")
            .select("id, sender_id, receiver_id, group_id, content, image_url, audio_url, created_at, seen")
            .or(orFilterParts.join(","))
            .order("created_at", { ascending: false })
            .limit(500)
        );
      } else {
        queries.push(Promise.resolve({ data: [] }));
      }

      queries.push(
        supabase
          .from("calls")
          .select("id, caller_id, callee_id, call_type, status, created_at")
          .eq("context", "friend")
          .or(`caller_id.eq.${myId},callee_id.eq.${myId}`)
          .order("created_at", { ascending: false })
          .limit(200)
      );

      const [profilesRes, msgsRes, callsRes] = await Promise.all(queries);
      const profiles = profilesRes.data ?? [];
      const msgs = msgsRes.data ?? [];
      const friendCalls = callsRes.data ?? [];

      let deletedIds: string[] = [];
      try {
        const parsed = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
        deletedIds = Array.isArray(parsed) ? parsed : [];
      } catch {}
      const deletedSet = new Set<string>(deletedIds);

      const byConvo: Record<string, Conversation> = {};
      profiles.forEach((p) => {
        const displayName = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.username;
        byConvo[p.id] = { 
          friendId: p.id, 
          username: p.username, 
          displayName,
          avatar_url: p.avatar_url, 
          online: p.online, 
          lastMessage: null, 
          lastAt: null, 
          unread: 0, 
          allText: "",
          vip_status: p.vip_status
        };
      });

      memberships.forEach((m: any) => {
        if (!m.groups) return;
        const g = m.groups;
        byConvo[`group-${g.id}`] = {
          friendId: `group-${g.id}`,
          isGroup: true,
          groupId: g.id,
          username: g.name,
          displayName: g.name,
          avatar_url: g.avatar_url,
          online: false,
          lastMessage: null,
          lastAt: null,
          unread: 0,
          allText: ""
        };
      });

      const filteredMsgs = msgs.filter((m) => !deletedSet.has(m.id));
      filteredMsgs.forEach((m: any) => {
        const convoId = m.group_id ? `group-${m.group_id}` : (m.sender_id === myId ? m.receiver_id : m.sender_id);
        const c = byConvo[convoId];
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

        if (preview && isSystemMessage(preview)) {
          preview = formatSystemMessage(preview);
        }

        if (!c.lastAt) { 
          c.lastMessage = preview; 
          c.lastAt = m.created_at; 
        }
        if (m.content) c.allText += " " + m.content.toLowerCase();
        
        if (m.group_id) {
          if (m.sender_id !== myId && !m.seen) c.unread++;
        } else {
          if (m.receiver_id === myId && !m.seen) c.unread++;
        }
      });

      friendCalls.forEach((call: any) => {
        const fid = call.caller_id === myId ? call.callee_id : call.caller_id;
        if (!fid) return;
        const c = byConvo[fid];
        if (!c) return;

        const callPreview = call.call_type === "video" ? "📹 Video call" : "📞 Voice call";
        if (!c.lastAt || new Date(call.created_at) > new Date(c.lastAt)) {
          c.lastMessage = callPreview;
          c.lastAt = call.created_at;
        }
      });

      const sortedList = Object.values(byConvo).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

      setConversations((prev) => {
        const prevMap = new Map(prev.map((c) => [c.friendId, c]));
        let hasChanged = false;

        const merged = sortedList.map((newConvo) => {
          const oldConvo = prevMap.get(newConvo.friendId);
          if (!oldConvo) {
            hasChanged = true;
            return newConvo;
          }

          const changed =
            oldConvo.username !== newConvo.username ||
            oldConvo.displayName !== newConvo.displayName ||
            oldConvo.avatar_url !== newConvo.avatar_url ||
            oldConvo.online !== newConvo.online ||
            oldConvo.lastMessage !== newConvo.lastMessage ||
            oldConvo.lastAt !== newConvo.lastAt ||
            oldConvo.unread !== newConvo.unread ||
            oldConvo.vip_status !== newConvo.vip_status;

          if (changed) {
            hasChanged = true;
            return { ...oldConvo, ...newConvo };
          }
          return oldConvo;
        });

        if (prev.length !== sortedList.length) {
          hasChanged = true;
        }

        if (!hasChanged) return prev;
        return merged.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
      });
      setCallsLog(friendCalls);
      try {
        await persistInboxCache(sortedList);
      } catch {}
    } catch (err) {
      console.error("Error loading conversations:", err);
    } finally {
      setLoadingConvs(false);
    }
  }

  /** Soft delta sync — merge recent message previews without rebuilding from 500 rows. */
  async function loadInboxDelta(myId: string) {
    try {
      const synced = getInboxSyncedAt();
      const sinceIso = synced ? new Date(synced).toISOString() : null;
      const patches = await fetchInboxDeltaPatches(myId, sinceIso);
      if (!patches.length) {
        setInboxSyncedAt();
        return;
      }
      setConversations((prev) => {
        let next = [...prev];
        for (const p of patches) {
          const idx = next.findIndex((c) => c.friendId === p.peerKey);
          if (idx === -1) continue;
          const row = { ...next[idx] };
          if (!row.lastAt || p.lastAt > row.lastAt) {
            row.lastMessage = p.lastMessage;
            row.lastAt = p.lastAt;
          }
          row.unread = (row.unread || 0) + p.unreadBump;
          next[idx] = row;
        }
        next = next.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
        void persistInboxCache(next);
        return next;
      });
      setInboxSyncedAt();
    } catch (err) {
      console.warn("[inbox-delta] soft sync failed, falling back to full load:", err);
      await load(myId);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user && mounted) {
        setMeId(u.user.id);
        setCurrentUser(u.user);
        try {
          localStorage.setItem("jj_me_id", u.user.id);
        } catch {}
        // Defer VIP serverFn until after inbox paint — cache already seeds vipStats.
        const { runAfterFirstPaint } = await import("@/lib/native/defer");
        runAfterFirstPaint(() => {
          if (mounted) loadVipStats(u.user!.id);
        }, 2000);
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

    // Native-first: warm cache paints instantly; skip immediate full 500-msg rebuild
    // unless cache is empty/stale. Soft-revalidate shortly after first paint.
    let softTimer: ReturnType<typeof setTimeout> | null = null;
    if (shouldFullRebuildInbox()) {
      load(meId);
    } else {
      setLoadingConvs(false);
      softTimer = setTimeout(() => {
        if (mounted) void loadInboxDelta(meId);
      }, 1500);
    }
    loadPage(meId);
    loadSpam(meId);
    loadSystemAnnouncements();

    const systemChannel = supabase
      .channel("system-announcements-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_announcements" }, () => {
        if (mounted) loadSystemAnnouncements();
      })
      .subscribe();

    const rand = Math.random().toString(36).slice(2, 9);
    const channel = supabase
      .channel(`conv-list-${rand}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        if (!mounted) return;
        const m = payload.new as any;
        if (!m || !m.sender_id || (!m.receiver_id && !m.group_id)) return;
        if (!m.group_id && m.sender_id !== meId && m.receiver_id !== meId) return;
        const isGroup = !!m.group_id;
        const isMine = m.sender_id === meId;
        const convoKey = isGroup ? `group-${m.group_id}` : (isMine ? m.receiver_id : m.sender_id);

        if (payload.eventType === "INSERT") {
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.friendId === convoKey);
            if (idx === -1) {
              fetchAndAppendConversation(convoKey, m.created_at);
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

            if (preview && isSystemMessage(preview)) {
              preview = formatSystemMessage(preview);
            }

            const updated = { ...prev[idx] };
            updated.lastMessage = preview;
            updated.lastAt = m.created_at;
            if (m.content) updated.allText += " " + m.content.toLowerCase();
            
            const isUnread = isGroup ? (!isMine && !m.seen) : (m.receiver_id === meId && !m.seen);
            if (isUnread) {
              updated.unread += 1;
            }

            const next = prev.filter((_, i) => i !== idx);
            next.push(updated);
            return next.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
          });
        } else if (payload.eventType === "UPDATE") {
          const isRead = isGroup ? (isMine || m.seen) : (m.receiver_id === meId && m.seen);
          if (isRead) {
            setConversations((prev) =>
              prev.map((c) => (c.friendId === convoKey ? { ...c, unread: 0 } : c))
            );
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, (payload) => {
        if (!mounted || !meId) return;
        const oldRow = payload.old as any;
        const newRow = payload.new as any;
        
        if (payload.eventType === "DELETE" && oldRow) {
          const friendId = oldRow.user_a === meId ? oldRow.user_b : oldRow.user_a;
          setConversations((prev) => {
            const next = prev.filter((c) => c.friendId !== friendId);
            try {
              localStorage.setItem("jj_cached_conversations", JSON.stringify(next));
            } catch {}
            return next;
          });
        } else if (payload.eventType === "INSERT" && newRow) {
          const friendId = newRow.user_a === meId ? newRow.user_b : newRow.user_a;
          fetchAndAppendConversation(friendId, new Date().toISOString());
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, (payload) => {
        if (!mounted || !meId) return;
        const oldRow = payload.old as any;
        const newRow = payload.new as any;
        
        if (payload.eventType === "DELETE" && oldRow) {
          const convoKey = `group-${oldRow.id}`;
          setConversations((prev) => {
            const next = prev.filter((c) => c.friendId !== convoKey);
            try {
              localStorage.setItem("jj_cached_conversations", JSON.stringify(next));
            } catch {}
            return next;
          });
        } else if (payload.eventType === "INSERT" && newRow) {
          const convoKey = `group-${newRow.id}`;
          fetchAndAppendConversation(convoKey, new Date().toISOString());
        } else if (payload.eventType === "UPDATE" && newRow) {
          const convoKey = `group-${newRow.id}`;
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.friendId === convoKey);
            if (idx === -1) return prev;
            const updated = {
              ...prev[idx],
              username: newRow.name,
              displayName: newRow.name,
              avatar_url: newRow.avatar_url
            };
            const next = prev.map((c, i) => i === idx ? updated : c);
            try {
              localStorage.setItem("jj_cached_conversations", JSON.stringify(next));
            } catch {}
            return next;
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, (payload) => {
        if (!mounted || !meId) return;
        const oldRow = payload.old as any;
        const newRow = payload.new as any;
        
        if (payload.eventType === "DELETE" && oldRow && oldRow.user_id === meId) {
          const convoKey = `group-${oldRow.group_id}`;
          setConversations((prev) => {
            const next = prev.filter((c) => c.friendId !== convoKey);
            try {
              localStorage.setItem("jj_cached_conversations", JSON.stringify(next));
            } catch {}
            return next;
          });
        } else if (payload.eventType === "INSERT" && newRow && newRow.user_id === meId) {
          const convoKey = `group-${newRow.group_id}`;
          fetchAndAppendConversation(convoKey, new Date().toISOString());
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        if (!mounted) return;
        const p = payload.new as any;
        if (!p) return;

        if (meId && p.id === meId) {
          try {
            const cachedStr = localStorage.getItem("jj_cached_my_profile");
            const cached = cachedStr ? JSON.parse(cachedStr) : {};
            localStorage.setItem("jj_cached_my_profile", JSON.stringify({ ...cached, ...p }));
          } catch {}
          if (p.vip_status) {
            setVipStats((prev) => {
              if (prev && prev.vip_status === p.vip_status) return prev;
              const next = prev ? { ...prev, vip_status: p.vip_status } : { vip_status: p.vip_status, vip_progress: 0, monthly_estimate: 0 };
              try {
                localStorage.setItem("jj_cached_my_vip_stats", JSON.stringify(next));
              } catch {}
              return next;
            });
          }
          return;
        }
        
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.friendId === p.id);
          if (idx === -1) return prev;
          
          const old = prev[idx];
          const hasChanged = old.online !== p.online || old.avatar_url !== p.avatar_url || old.username !== p.username || old.vip_status !== p.vip_status;
          if (!hasChanged) return prev;
          
          const updated = {
            ...old,
            online: p.online || false,
            avatar_url: p.avatar_url || old.avatar_url,
            username: p.username || old.username,
            vip_status: p.vip_status || old.vip_status
          };
          
          const next = prev.map((c, i) => i === idx ? updated : c);
          try {
            localStorage.setItem("jj_cached_conversations", JSON.stringify(next));
          } catch {}
          return next;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "page_messages" }, (payload) => {
        if (!mounted) return;
        const m = (payload.new ?? payload.old) as any;
        if (!m) return;
        if (m.conversation_id !== pageConvIdRef.current) return;

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

        if (payload.eventType === "INSERT") {
          setCallsLog(prev => [c, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setCallsLog(prev => prev.map(item => item.id === c.id ? c : item));
        } else if (payload.eventType === "DELETE") {
          const old = payload.old as any;
          if (old?.id) {
            setCallsLog(prev => prev.filter(item => item.id !== old.id));
          }
        }
        
        const callPreview = c.call_type === "video" ? "📹 Video call" : "📞 Voice call";

        if (c.context === "page" || c.context === "page_broadcast") {
          if (c.page_conversation_id && c.page_conversation_id !== pageConvIdRef.current) return;
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

    const onForeground = () => {
      if (!mounted) return;
      void NetworkManager.processQueues().catch(() => {});
      // Soft inbox catch-up on resume (not a forced full rebuild).
      void loadInboxDelta(meId);
      loadPage(meId);
    };
    window.addEventListener("jj-app-foreground", onForeground);

    return () => {
      mounted = false;
      if (softTimer) clearTimeout(softTimer);
      window.removeEventListener("jj-app-foreground", onForeground);
      supabase.removeChannel(channel);
      supabase.removeChannel(systemChannel);
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
    if (conversations.length > 0) {
      try {
        localStorage.setItem("jj_cached_conversations", JSON.stringify(conversations));
      } catch {}
    }
  }, [conversations]);

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
  const visible = conversations.filter((c) => {
    if (tab === "spam") return spamIds.has(c.friendId);
    if (tab === "groups") return c.friendId.startsWith("group-");
    return !spamIds.has(c.friendId);
  });
  const filtered = visible.filter((c) =>
    !q || c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q) || c.allText.includes(q)
  );
  const spamCount = conversations.filter((c) => spamIds.has(c.friendId)).length;

  const onlineFriends = conversations.filter((c) => c.online && !spamIds.has(c.friendId));

  const rulesList = systemAnnouncements.filter(a => a.channel_type === "rules");
  const updatesList = systemAnnouncements.filter(a => a.channel_type === "updates");

  const lastRules = rulesList[0];
  const lastUpdates = updatesList[0];

  const rulesLastRead = typeof window !== "undefined" ? localStorage.getItem("jj_rules_last_read") || "" : "";
  const updatesLastRead = typeof window !== "undefined" ? localStorage.getItem("jj_updates_last_read") || "" : "";

  const unreadRules = lastRules && rulesLastRead < lastRules.created_at ? 1 : 0;
  const unreadUpdates = lastUpdates && updatesLastRead < lastUpdates.created_at ? 1 : 0;

  const aiLastMessage = typeof window !== "undefined" ? localStorage.getItem("jj_ai_last_msg") : null;
  const aiLastAt = typeof window !== "undefined" ? localStorage.getItem("jj_ai_last_at") : null;

  const virtualAI = {
    friendId: "system-user-ai-chat",
    displayName: "✨ Jackpot Jungle AI",
    username: "jackpotjungle_ai",
    avatar_url: null,
    online: true,
    lastMessage: aiLastMessage || "Welcome to Jackpot Jungle! I'm your assistant...",
    lastAt: aiLastAt || new Date().toISOString(),
    unread: 0,
    credit: 0,
    isSpam: false,
    allText: "ai assistant help bot jackpot jungle bonuses games vip deposit withdraw support",
    isSystem: true,
    isAi: true
  };

  const virtualRules = {
    friendId: "system-rules-chat",
    displayName: "Rules",
    username: "system_rules",
    avatar_url: null,
    online: true,
    lastMessage: lastRules ? (lastRules.content || "Media Attachment") : "Official platform rules",
    lastAt: lastRules ? lastRules.created_at : null,
    unread: unreadRules,
    credit: 0,
    isSpam: false,
    allText: "rules regulations guidelines terms rules policy",
    isSystem: true
  };

  const virtualUpdates = {
    friendId: "system-updates-chat",
    displayName: "Updates",
    username: "system_updates",
    avatar_url: null,
    online: true,
    lastMessage: lastUpdates ? (lastUpdates.content || "Media Attachment") : "Official announcements",
    lastAt: lastUpdates ? lastUpdates.created_at : null,
    unread: unreadUpdates,
    credit: 0,
    isSpam: false,
    allText: "updates announcements news logs updates features",
    isSystem: true
  };

  const systemConvs = [virtualAI, virtualRules, virtualUpdates].filter(c =>
    !q || c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q) || c.allText.includes(q)
  );

  const sortedNormal = [...filtered].sort((a, b) => {
    const aPinned = pinnedFriends.includes(a.friendId);
    const bPinned = pinnedFriends.includes(b.friendId);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  const sorted = tab === "spam" ? sortedNormal : [...systemConvs, ...sortedNormal];

  return (
    <AppShell>
      <div className="flex h-full w-full overflow-hidden bg-background">
        {/* Sidebar Panel — hidden on mobile when a chat is open */}
        <div className={`${hasActive ? "hidden md:flex flex-col" : "flex flex-col"} w-full md:max-w-sm md:border-r md:border-border min-h-0 shrink-0`}>
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HamburgerButton />
                <h2 className="text-xl font-bold">Chats</h2>
              </div>
              <button
                onClick={() => setCreateGroupOpen(true)}
                className="hidden md:flex h-8 w-8 rounded-full items-center justify-center hover:bg-secondary text-primary transition-colors"
                title="New Group Chat"
              >
                <Users className="h-5 w-5" />
              </button>
            </div>

            {/* Premium VIP Progression & Wallet Card */}
            {(() => {
              const vipStatus = vipStats?.profile?.vipStatus && vipStats.profile.vipStatus !== "none"
                ? vipStats.profile.vipStatus
                : "gold"; // Default to gold for display placeholder
              const badgeUrl = getVipBadgeUrl(vipStatus) || "/gold.png";
              const progressPercentage = vipStats?.progression?.progressPercentage !== undefined
                ? vipStats.progression.progressPercentage
                : 72;
              const nextTierName = vipStats?.progression?.nextTier || "Platinum";
              const currentTierName = vipStats?.progression?.currentTier || "Gold VIP";
              const walletBalanceVal = vipStats?.profile?.walletBalance !== undefined
                ? Number(vipStats.profile.walletBalance).toFixed(2)
                : "580.00";
              const monthlyRewardVal = vipStats?.activeMonthEstimate?.rewardAmount !== undefined
                ? Number(vipStats.activeMonthEstimate.rewardAmount).toFixed(2)
                : "96.50";
              const remainingDeposits = vipStats?.progression?.remainingDeposits !== undefined
                ? vipStats.progression.remainingDeposits
                : 250;

              return (
                <div className="mb-4 bg-card text-card-foreground border border-border/80 rounded-3xl p-4 shadow-sm space-y-4">
                  {/* Top row */}
                  <div className="flex items-stretch justify-between gap-1 select-none">
                    {/* Left: Badge and progress */}
                    <div className="flex-[1.4] flex items-center gap-2.5 min-w-0">
                      <img
                        src={badgeUrl}
                        alt={currentTierName}
                        className="h-11 w-11 object-contain shrink-0"
                        onError={(e) => {
                          // Fallback in case path doesn't load
                          (e.target as HTMLImageElement).src = "/gold.png";
                        }}
                      />
                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <span className="text-xs font-black text-foreground truncate">
                          {currentTierName}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium mt-0.5 truncate">
                          {remainingDeposits > 0 
                            ? `${progressPercentage}% to ${nextTierName}`
                            : "Maximum Tier reached"
                          }
                        </span>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden mt-1.5 border border-border/30">
                          <div
                            className="bg-blue-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${remainingDeposits > 0 ? progressPercentage : 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Vertical Divider */}
                    <div className="border-r border-border/80 h-10 self-center mx-1.5 shrink-0" />

                    {/* Middle: Wallet Balance */}
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider truncate">
                        Wallet Balance
                      </span>
                      <span className="text-sm font-black text-green-600 font-mono mt-1 truncate">
                        ${walletBalanceVal}
                      </span>
                    </div>

                    {/* Vertical Divider */}
                    <div className="border-r border-border/80 h-10 self-center mx-1.5 shrink-0" />

                    {/* Right: Est. Monthly Reward */}
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider truncate">
                        Est. Monthly Reward
                      </span>
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono mt-1 truncate">
                        ${monthlyRewardVal}
                      </span>
                    </div>
                  </div>

                  {/* Divider line */}
                  <div className="border-t border-border/60" />

                  {/* Bottom row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">
                        Next Best Action
                      </span>
                      <p className="text-xs font-bold text-foreground truncate mt-0.5">
                        {remainingDeposits > 0 
                          ? `Deposit $${remainingDeposits} more`
                          : "Maxed out. No further deposits needed."
                        }
                      </p>
                      {remainingDeposits > 0 && (
                        <p className="text-[10px] text-green-600 font-bold mt-0.5">
                          Est. Reward +${Math.ceil(remainingDeposits * 0.05)}
                        </p>
                      )}
                    </div>
                    
                    <Link
                      to="/app/deposit"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-xs rounded-2xl shrink-0 transition-all flex items-center gap-1 shadow-sm shadow-blue-500/10"
                    >
                      <span>Deposit Now</span>
                      <span className="text-[9px] font-black">&gt;</span>
                    </Link>
                  </div>
                </div>
              );
            })()}

            {tab === "all" && onlineFriends.length > 0 && (
              <div className="flex items-center gap-4 py-2 mt-3 overflow-x-auto no-scrollbar">
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
            <div className="hidden md:flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setTab("all")}
                className={`flex-1 min-w-[50px] text-[10px] sm:text-xs font-bold py-1.5 px-2 rounded-full transition-colors shrink-0 ${tab === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
              >
                All
              </button>
              <button
                onClick={() => setTab("groups")}
                className={`flex-1 min-w-[60px] text-[10px] sm:text-xs font-bold py-1.5 px-2 rounded-full transition-colors shrink-0 ${tab === "groups" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
              >
                Groups
              </button>
              <button
                onClick={() => setTab("calls")}
                className={`flex-1 min-w-[55px] text-[10px] sm:text-xs font-bold py-1.5 px-2 rounded-full transition-colors shrink-0 ${tab === "calls" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
              >
                Calls
              </button>
              <button
                onClick={() => setTab("spam")}
                className={`flex-1 min-w-[60px] text-[10px] sm:text-xs font-bold py-1.5 px-2 rounded-full transition-colors shrink-0 flex items-center justify-center gap-1 ${tab === "spam" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
              >
                <Ban className="h-3 w-3" /> Spam{spamCount > 0 ? ` (${spamCount})` : ""}
              </button>
            </div>
            <div className="relative mt-3">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search Messenger"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-full bg-secondary border-transparent"
              />
            </div>
          </div>
          <PullToRefresh onRefresh={async () => { if (meId) { await Promise.all([load(meId), loadPage(meId), loadSpam(meId)]); } }}>
            {tab === "groups" && (
              <button
                onClick={() => setCreateGroupOpen(true)}
                className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-2xl text-left bg-primary/10 hover:bg-primary/15 text-primary border border-primary/15 transition-all font-semibold"
              >
                <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Plus className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold leading-tight">Create Group Chat</p>
                  <p className="text-[10px] text-muted-foreground/90 truncate leading-snug">Start a group chat with friends or players</p>
                </div>
              </button>
            )}
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
                    {pageLast.at && !isNaN(new Date(pageLast.at).getTime()) && (
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

            {tab === "calls" ? (
              callsLog.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground select-none flex flex-col items-center justify-center gap-1.5">
                  <Phone className="h-6 w-6 opacity-30" />
                  <p className="font-bold">No call history</p>
                  <p className="text-[10px] leading-relaxed">Your voice and video call logs will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {callsLog.map((call) => {
                    const isCallerMe = call.caller_id === meId;
                    const counterpartId = isCallerMe ? call.callee_id : call.caller_id;
                    const counterpartProfile = conversations.find(c => c.friendId === counterpartId);
                    const displayName = counterpartProfile?.displayName || "Unknown Player";
                    const isVideo = call.call_type === "video";
                    const isMissed = !isCallerMe && call.status === "missed";
                    
                    return (
                      <div key={call.id} className="flex items-center justify-between px-3 py-3 mx-2 my-1 rounded-xl hover:bg-secondary/40 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <Avatar name={displayName} url={counterpartProfile?.avatar_url} size={40} />
                            {isMissed && (
                              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2 rounded-full bg-destructive" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate text-foreground">{displayName}</p>
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              {isVideo ? "📹 Video Call" : "📞 Voice Call"}
                              <span>•</span>
                              <span className={isMissed ? "text-destructive font-semibold" : ""}>
                                {isMissed ? "Missed" : call.status === "active" ? "Active" : call.status === "completed" ? `${call.duration_seconds || 0}s` : "No answer"}
                              </span>
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-muted-foreground font-mono mr-2">
                            {call.created_at ? formatDistanceToNow(new Date(call.created_at), { addSuffix: false }) : ""}
                          </span>
                          {counterpartId && (
                            <Link
                              to="/app/chat/$friendId"
                              params={{ friendId: counterpartId }}
                              className="h-8 w-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-primary transition-all"
                              title="Chat / Callback"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : loadingConvs && conversations.length === 0 ? (
              <ChatListSkeleton rows={9} />
            ) : sorted.length === 0 ? (
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
          {/* Active Chat Panel — full screen on mobile when open */}
          <div className={`${hasActive ? "flex flex-col" : "hidden md:flex flex-col"} flex-1 min-h-0 w-full overflow-hidden`}>
            {hasActive ? (
              <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
                <Outlet />
              </div>
            ) : (
              <EmptyState />
            )}
          </div>
      </div>

      {contextMenuTarget && (() => {
        if (contextMenuTarget.startsWith("system-")) return null;
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

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        meId={meId}
        onGroupCreated={(groupId) => {
          load(meId!).then(() => {
            navigate({ to: "/app/chat/$friendId", params: { friendId: `group-${groupId}` } });
          });
        }}
      />


    </AppShell>
  );
}

export interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  meId: string | null;
  onGroupCreated: (groupId: string) => void;
  isAdminOrSuper?: boolean;
  preselectedMemberId?: string | null;
  isAdminTeamChat?: boolean;
}

export function CreateGroupModal({ 
  open, 
  onClose, 
  meId, 
  onGroupCreated, 
  isAdminOrSuper: forceAdminOrSuper,
  preselectedMemberId,
  isAdminTeamChat = false,
}: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [groupAvatar, setGroupAvatar] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preselectedProfile, setPreselectedProfile] = useState<any | null>(null);
  const { role } = useRole();
  const isAdminOrSuper = forceAdminOrSuper !== undefined ? forceAdminOrSuper : (role === "admin" || role === "super_admin" || isAdminTeamChat);

  useEffect(() => {
    if (open && preselectedMemberId) {
      setSelectedMembers([preselectedMemberId]);
      if (preselectedMemberId === "support-page-temp") {
        setPreselectedProfile({
          id: "support-page-temp",
          username: "jackpotjungle",
          first_name: "Jackpot",
          last_name: "Jungle",
          avatar_url: "/icons/icon-256.webp"
        });
      } else {
        supabase
          .from("profiles")
          .select("id, username, first_name, last_name, avatar_url")
          .eq("id", preselectedMemberId)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setPreselectedProfile(data);
          });
      }
    } else if (open) {
      setSelectedMembers([]);
      setPreselectedProfile(null);
    }
  }, [open, preselectedMemberId]);

  useEffect(() => {
    if (!open || !meId) return;

    async function fetchFriends() {
      setLoading(true);
      try {
        if (isAdminTeamChat) {
          const { data: roleRows } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["admin", "super_admin"]);
          const staffIds = (roleRows ?? []).map(r => r.user_id).filter(id => id !== meId);
          if (staffIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, username, first_name, last_name, avatar_url")
              .in("id", staffIds);
            setFriends(profiles ?? []);
          } else {
            setFriends([]);
          }
          return;
        }

        const { data: friendships } = await supabase
          .from("friendships")
          .select("user_a, user_b");
        if (!friendships) return;
        const friendIds = friendships.map(f => f.user_a === meId ? f.user_b : f.user_a);
        if (friendIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username, first_name, last_name, avatar_url")
            .in("id", friendIds);
          setFriends(profiles ?? []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (!isAdminOrSuper || isAdminTeamChat) {
      fetchFriends();
    }
  }, [open, meId, isAdminOrSuper, isAdminTeamChat]);

  useEffect(() => {
    if (!open || !isAdminOrSuper || !searchQuery.trim()) {
      setAllProfiles([]);
      return;
    }

    const delay = setTimeout(async () => {
      setLoading(true);
      try {
        if (isAdminTeamChat) {
          const { data: roleRows } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["admin", "super_admin"]);
          const staffIds = (roleRows ?? []).map(r => r.user_id).filter(id => id !== meId);
          if (staffIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, username, first_name, last_name, avatar_url")
              .in("id", staffIds)
              .ilike("username", `%${searchQuery.trim()}%`)
              .limit(30);
            setAllProfiles(profiles ?? []);
          } else {
            setAllProfiles([]);
          }
          return;
        }

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, first_name, last_name, avatar_url")
          .neq("id", meId)
          .neq("username", "jackpotjungle")
          .ilike("username", `%${searchQuery.trim()}%`)
          .limit(30);
        setAllProfiles(profiles ?? []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [searchQuery, open, isAdminOrSuper, meId, isAdminTeamChat]);

  async function handleCreate() {
    if (!groupName.trim() || !meId) {
      toast.error("Please enter a group name");
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one member to add");
      return;
    }

    setCreating(true);
    try {
      const { data: newGroup, error: groupErr } = await supabase
        .from("groups")
        .insert({
          name: groupName.trim(),
          avatar_url: groupAvatar.trim() || "/groop.png",
          created_by: meId,
          is_admin_team: isAdminTeamChat
        } as any)
        .select()
        .single();

      if (groupErr) throw groupErr;

      let finalMembersToInsert = [...selectedMembers];
      if (selectedMembers.includes("support-page-temp")) {
        finalMembersToInsert = finalMembersToInsert.filter(id => id !== "support-page-temp");
        const { data: adminRows } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "super_admin"]);
        
        if (adminRows && adminRows.length > 0) {
          const adminUserIds = adminRows.map(r => r.user_id);
          adminUserIds.forEach(uid => {
            if (uid !== meId && !finalMembersToInsert.includes(uid)) {
              finalMembersToInsert.push(uid);
            }
          });
        }
      }

      const membersToInsert = [
        { group_id: newGroup.id, user_id: meId, role: "admin" },
        ...finalMembersToInsert.map(uid => ({ group_id: newGroup.id, user_id: uid, role: "member" }))
      ];

      const { error: membersErr } = await supabase
        .from("group_members")
        .insert(membersToInsert);

      if (membersErr) throw membersErr;

      await supabase
        .from("messages")
        .insert({
          sender_id: meId,
          group_id: newGroup.id,
          content: `[system:group_created]`
        } as any);

      toast.success("Group created successfully!");
      onGroupCreated(newGroup.id);
      onClose();
      setGroupName("");
      setGroupAvatar("");
      setSelectedMembers([]);
    } catch (err: any) {
      toast.error(err.message || "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  const jackpotJungleVirtual = {
    id: "support-page-temp",
    username: "jackpotjungle",
    first_name: "Jackpot",
    last_name: "Jungle",
    avatar_url: "/icons/icon-256.webp"
  };

  let displayList = isAdminOrSuper 
    ? (searchQuery.trim() ? allProfiles : []) 
    : (searchQuery.trim()
        ? friends.filter((item) => {
            const dispName = item.first_name && item.last_name ? `${item.first_name} ${item.last_name}` : item.username;
            return (
              dispName.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.username.toLowerCase().includes(searchQuery.toLowerCase())
            );
          })
        : friends);

  if (!isAdminOrSuper) {
    const qLower = searchQuery.toLowerCase().trim();
    const matchesQuery = !qLower || 
      "jackpot jungle".includes(qLower) || 
      "jackpotjungle".includes(qLower);
    if (matchesQuery) {
      displayList = [jackpotJungleVirtual, ...displayList];
    }
  }

  // Prepend preselected profile to make sure they are at the top and visible
  if (preselectedProfile) {
    displayList = [
      preselectedProfile,
      ...displayList.filter(item => item.id !== preselectedProfile.id)
    ];
  }

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] text-foreground overflow-y-auto [&>button]:hidden">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="font-bold text-lg">New Group Chat</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Group Name</label>
            <Input
              placeholder="e.g. Jackpot Masters"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={creating}
              className="rounded-xl bg-background/50 border-border/80"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Group Photo URL (Optional)</label>
            <Input
              placeholder="https://example.com/avatar.png"
              value={groupAvatar}
              onChange={(e) => setGroupAvatar(e.target.value)}
              disabled={creating}
              className="rounded-xl bg-background/50 border-border/80"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-2">
              {isAdminOrSuper ? "Search and Add Members" : "Select Friends"}
            </label>
            <div className="relative mb-3">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={isAdminOrSuper ? "Search user profiles..." : "Search friends..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 rounded-xl bg-background/50 border-border/80"
              />
            </div>

            <div className="max-h-48 overflow-y-auto border border-border/60 rounded-xl divide-y divide-border/40 bg-background/30">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : displayList.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {isAdminOrSuper 
                    ? (searchQuery.trim() ? "No users found" : "Type to search users") 
                    : (searchQuery.trim() ? "No matching friends found" : "No friends available to add")}
                </div>
              ) : (
                displayList.map((item) => {
                  const isChecked = selectedMembers.includes(item.id);
                  const dispName = item.first_name && item.last_name ? `${item.first_name} ${item.last_name}` : item.username;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedMembers(prev =>
                          isChecked ? prev.filter(uid => uid !== item.id) : [...prev, item.id]
                        );
                      }}
                      className="flex items-center justify-between p-3 hover:bg-secondary/40 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={dispName} url={item.avatar_url} size={36} />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{dispName}</p>
                          <p className="text-[10px] text-muted-foreground">@{item.username}</p>
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${isChecked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 bg-transparent"}`}>
                        {isChecked && <Check className="h-3 w-3" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-3 border-t border-border mt-2">
          <button
            onClick={onClose}
            disabled={creating}
            className="flex-1 h-11 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors border border-border"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !groupName.trim() || selectedMembers.length === 0}
            className="flex-1 h-11 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Create Group</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
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
          if (c.friendId.startsWith("system-")) return;
          startTouch(c.friendId);
          if (meId) prefetchConversation(meId, c.friendId);
        }}
        onMouseEnter={() => {
          if (c.friendId.startsWith("system-")) return;
          if (meId) prefetchConversation(meId, c.friendId);
        }}
        onPointerUp={endTouch}
        onPointerMove={endTouch}
        onPointerLeave={endTouch}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!c.friendId.startsWith("system-")) {
            setContextMenuTarget(c.friendId);
          }
        }}
        className={`flex items-center gap-3 px-3 py-3 mx-2 my-1 rounded-xl hover:bg-secondary transition-colors select-none ${isActive ? "bg-secondary" : ""}`}
      >
        <div className="relative shrink-0">
          {c.friendId === "system-rules-chat" ? (
            <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-white shadow-md">
              <BookOpen className="h-5.5 w-5.5" />
            </div>
          ) : c.friendId === "system-updates-chat" ? (
            <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Megaphone className="h-5.5 w-5.5 animate-pulse" />
            </div>
          ) : c.friendId === "system-user-ai-chat" ? (
            <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="h-5.5 w-5.5" />
            </div>
          ) : (
            <Avatar name={c.displayName} url={c.avatar_url} isGroup={c.friendId.startsWith("group-")} />
          )}
          {c.online && !isSpam && !isSpammedBy && !c.friendId.startsWith("system-") && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
        </div>
        <div className="flex-1 min-w-0 pr-10">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`truncate text-sm flex items-center gap-1.5 ${c.unread > 0 ? "font-bold" : "font-semibold"}`}>
              {c.displayName}
              {c.vip_status && c.vip_status !== "none" && (
                <img 
                  src={getVipBadgeUrl(c.vip_status) || undefined} 
                  alt={`${c.vip_status} VIP`} 
                  className="h-4 w-auto object-contain select-none shrink-0"
                  title={`${c.vip_status.toUpperCase()} VIP`}
                />
              )}
              {isPinned && <Pin className="h-3.5 w-3.5 text-primary rotate-45 fill-primary shrink-0" />}
            </p>
            {c.lastAt && !isNaN(new Date(c.lastAt).getTime()) && (
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
      {!c.friendId.startsWith("system-") && (
        <button
          onClick={(e) => toggleSpam(e, c.friendId, isSpam)}
          title={isSpam ? "Remove from spam" : "Move to spam"}
          aria-label={isSpam ? "Remove from spam" : "Move to spam"}
          className="absolute right-3 top-1/2 -translate-y-1/2 touch-target rounded-full bg-background/95 border border-border items-center justify-center text-muted-foreground active:bg-secondary flex opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity"
          style={isSpam ? { opacity: 1 } : undefined}
        >
          {isSpam ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
});
