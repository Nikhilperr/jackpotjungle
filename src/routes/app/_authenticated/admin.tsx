import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toCDNUrl } from "@/config";
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, type AppRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { Capacitor } from "@capacitor/core";
import { useNativePush } from "@/hooks/useNativePush";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar } from "@/components/messenger/Avatar";
import { useCalls } from "@/components/messenger/CallProvider";
import { CallMessage } from "@/components/messenger/CallMessage";
import {
  Search,
  Send,
  Shield,
  Inbox,
  Users as UsersIcon,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  ArrowLeft,
  Menu,
  X,
  Ban,
  RotateCcw,
  Phone,
  Video,
  Reply,
  Forward,
  Copy,



  User as UserIcon,
  LogOut,
  Loader2,
  ImageIcon,
  Tag as TagIcon,
  MessageSquareQuote,
  Megaphone,
  Bell,
  Bot,
  Activity,
  Gift,
  Settings as SettingsIcon,
  Pin,
} from "lucide-react";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { VoiceMessage } from "@/components/messenger/VoiceMessage";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { unsendPageMessagesServer } from "@/lib/messages.functions";
import { PullToRefresh } from "@/components/messenger/PullToRefresh";
import { getCachedPageMessages, setCachedPageMessages } from "@/lib/chat-cache";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  TagsView,
  QuickRepliesView,
  BroadcastsView,
  FollowupsView,
  AutoResponsesView,
  LogsView,
  UserDetailPanel,
  SuperAdminView,
  ReferralsAdminView,
  AdminProfileView,
} from "@/components/admin/AdminViews";
import { SignOutDialog } from "@/components/messenger/SignOutDialog";

type Tab =
  | "inbox"
  | "quickreplies"
  | "tags"
  | "broadcasts"
  | "followups"
  | "autoresp"
  | "referrals"
  | "logs"
  | "admins"
  | "super"
  | "profile";

type AdminSearch = {
  c?: string;
  profile?: boolean;
  tab?: Tab;
  menu?: boolean;
};

export const Route = createFileRoute("/app/_authenticated/admin")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): AdminSearch => {
    const validTabs: Tab[] = [
      "inbox", "quickreplies", "tags", "broadcasts", "followups",
      "autoresp", "referrals", "logs", "admins", "super", "profile"
    ];
    const incomingTab = search.tab as Tab;
    return {
      c: typeof search.c === "string" ? search.c : undefined,
      profile: search.profile === true || search.profile === "true",
      tab: validTabs.includes(incomingTab) ? incomingTab : undefined,
      menu: search.menu === true || search.menu === "true",
    };
  },
  head: () => ({ meta: [{ title: "Admin — Jackpot Jungle Messenger" }] }),
  component: AdminPage,
});

type ConvRow = {
  conversationId: string;
  userId: string;
  username: string;
  avatar_url: string | null;
  online: boolean;
  last_seen: string;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
  credit: number;
  isSpam: boolean;
};

function AdminPage() {
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin, loading } = useRole();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchParams = Route.useSearch();
  const tab = searchParams.tab || "inbox";
  const setTab = (newTab: Tab) => {
    navigate({
      search: (old: any) => ({
        ...old,
        tab: newTab === "inbox" ? undefined : newTab,
        menu: true,
      }),
      replace: true,
    });
    setTimeout(() => {
      navigate({
        search: (old: any) => ({
          ...old,
          tab: newTab === "inbox" ? undefined : newTab,
          menu: undefined,
        }),
        replace: false,
      });
    }, 50);
  };
  const navOpen = !!searchParams.menu;
  const setNavOpen = (val: boolean) => {
    navigate({
      search: (old: any) => ({
        ...old,
        menu: val ? true : undefined,
      }),
      replace: false,
    });
  };
  const [confirmOut, setConfirmOut] = useState(false);

  useNativePush();

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app/chat", replace: true });
  }, [loading, isAdmin, navigate]);

  async function signOut() {
    try {
      await supabase
        .from("profiles")
        .update({ online: false, last_seen: new Date().toISOString() })
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
    } catch (e) {
      console.error("Failed to update profile presence during sign out:", e);
    }
    await qc.cancelQueries();
    qc.clear();

    if (Capacitor.isNativePlatform()) {
      try {
        const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
        await GoogleAuth.signOut();
      } catch (e) {
        console.error("Google native sign out failed:", e);
      }
    }

    await supabase.auth.signOut();
    navigate({ to: "/app/auth", replace: true });
  }

  if (loading || !isAdmin || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  function selectTab(t: string) {
    setTab(t);
    setNavOpen(false);
  }

  const SideNav = (
    <aside className="w-60 md:w-56 h-full border-r border-border bg-card flex flex-col">
      <div className="px-4 py-5 flex items-center gap-2 border-b border-border">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Shield className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm leading-tight">JJ Business</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {isSuperAdmin ? "Super Admin" : "Admin"}
          </p>
        </div>
        <button
          onClick={() => setNavOpen(false)}
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        <p className="px-3 pt-1 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Business</p>
        <SideBtn active={tab === "inbox"} onClick={() => selectTab("inbox")} icon={Inbox} label="Page Inbox" />
        <SideBtn active={tab === "quickreplies"} onClick={() => selectTab("quickreplies")} icon={MessageSquareQuote} label="Quick Replies" />
        <SideBtn active={tab === "tags"} onClick={() => selectTab("tags")} icon={TagIcon} label="Tags" />
        <SideBtn active={tab === "broadcasts"} onClick={() => selectTab("broadcasts")} icon={Megaphone} label="Broadcasts" />
        <SideBtn active={tab === "followups"} onClick={() => selectTab("followups")} icon={Bell} label="Follow-ups" />
        <SideBtn active={tab === "autoresp"} onClick={() => selectTab("autoresp")} icon={Bot} label="Auto-response" />
        <SideBtn active={tab === "referrals"} onClick={() => selectTab("referrals")} icon={Gift} label="Referrals" />
        <SideBtn active={tab === "logs"} onClick={() => selectTab("logs")} icon={Activity} label="Logs" />
        {isSuperAdmin && (
          <>
            <p className="px-3 pt-4 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Super admin</p>
            <SideBtn active={tab === "admins"} onClick={() => selectTab("admins")} icon={UsersIcon} label="Admin team" />
            <SideBtn active={tab === "super"} onClick={() => selectTab("super")} icon={SettingsIcon} label="System settings" />
          </>
        )}
        <p className="px-3 pt-4 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">My account</p>
        <SideBtn active={tab === "profile"} onClick={() => selectTab("profile")} icon={UserIcon} label="My profile" />
      </nav>
      <div className="px-3 py-3 border-t border-border flex items-center gap-2">
        <ThemeToggle />
        <button
          onClick={() => { setNavOpen(false); setConfirmOut(true); }}
          className="flex-1 h-10 rounded-lg flex items-center gap-2 px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Side nav drawer for both desktop and mobile */}
      {navOpen && (
        <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
          <div className="relative z-10 animate-in slide-in-from-left duration-200">{SideNav}</div>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {tab === "inbox" && <InboxView meId={user.id} onOpenNav={() => setNavOpen(true)} />}
        {tab === "quickreplies" && <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Quick Replies"><QuickRepliesView meId={user.id} /></ScrollWrap>}
        {tab === "tags" && <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Tags"><TagsView /></ScrollWrap>}
        {tab === "broadcasts" && <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Broadcasts"><BroadcastsView /></ScrollWrap>}
        {tab === "followups" && <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Follow-ups"><FollowupsView meId={user.id} /></ScrollWrap>}
        {tab === "autoresp" && <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Auto-response"><AutoResponsesView meId={user.id} /></ScrollWrap>}
        {tab === "referrals" && <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Referrals"><ReferralsAdminView /></ScrollWrap>}
        {tab === "logs" && <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Logs"><LogsView /></ScrollWrap>}
        {tab === "admins" && <AdminsView onOpenNav={() => setNavOpen(true)} />}
        {tab === "super" && <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Super admin"><SuperAdminView /></ScrollWrap>}
        {tab === "profile" && <ScrollWrap onOpenNav={() => setNavOpen(true)} title="My profile"><AdminProfileView userId={user.id} email={user.email ?? null} /></ScrollWrap>}
      </main>

      <SignOutDialog isOpen={confirmOut} onClose={() => setConfirmOut(false)} onConfirm={signOut} />
    </div>
  );
}

function ScrollWrap({ onOpenNav, title, children }: { onOpenNav: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-3 py-3 flex items-center gap-2 shrink-0">
        <button onClick={onOpenNav} className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="font-bold">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function SideBtn({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: typeof Inbox; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full h-10 rounded-lg flex items-center gap-3 px-3 text-sm font-medium transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function NavLink({ to, icon: Icon, label, onClick }: { to: string; icon: typeof Inbox; label: string; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="w-full h-10 rounded-lg flex items-center gap-3 px-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

/* ---------------- PAGE INBOX (all admins share) ---------------- */

function InboxView({ meId, onOpenNav }: { meId: string; onOpenNav: () => void }) {
  const navigate = useNavigate();
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [search, setSearch] = useState("");
  const searchParams = Route.useSearch();
  
  const activeId = searchParams.c || null;
  const setActiveId = (id: string | null) => {
    navigate({
      search: (old: any) => ({
        ...old,
        c: id || undefined,
        profile: id ? old.profile : undefined,
      }),
      replace: false,
    });
  };

  const detailOpen = !!searchParams.profile;
  const setDetailOpen = (val: boolean) => {
    navigate({
      search: (old: any) => ({
        ...old,
        profile: val ? true : undefined,
      }),
      replace: false,
    });
  };

  const [allTags, setAllTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [userTagMap, setUserTagMap] = useState<Record<string, string[]>>({});
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [viewSpam, setViewSpam] = useState(false);
  const [pinnedConvs, setPinnedConvs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("jj_pinned_convs");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [contextMenuTarget, setContextMenuTarget] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const togglePin = (convId: string) => {
    let next: string[];
    if (pinnedConvs.includes(convId)) {
      next = pinnedConvs.filter(id => id !== convId);
      toast.success("Chat unpinned");
    } else {
      next = [...pinnedConvs, convId];
      toast.success("Chat pinned to top");
    }
    setPinnedConvs(next);
    localStorage.setItem("jj_pinned_convs", JSON.stringify(next));
  };

  async function load() {
    const { data: convList } = await supabase
      .from("page_conversations")
      .select("id, user_id, last_message_at, is_spam");
    if (!convList) return;
    const userIds = convList.map((c) => c.user_id);
    const convIds = convList.map((c) => c.id);
    if (userIds.length === 0) { setConvs([]); return; }

    const [{ data: profiles }, { data: msgs }, { data: tagsData }, { data: utRows }, { data: credRows }, { data: supportCalls }] = await Promise.all([
      supabase.from("profiles").select("id, username, avatar_url, online, last_seen").in("id", userIds),
      supabase
        .from("page_messages")
        .select("conversation_id, content, created_at, seen, from_page, image_url, audio_url")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false }),
      supabase.from("tags").select("id, name, color").order("name"),
      supabase.from("user_tags").select("user_id, tag_id").in("user_id", userIds),
      supabase.from("user_credits").select("user_id, balance").in("user_id", userIds),
      supabase
        .from("calls")
        .select("id, caller_id, callee_id, call_type, status, created_at")
        .in("context", ["page", "page_broadcast"])
        .order("created_at", { ascending: false })
        .limit(300)
    ]);

    setAllTags(tagsData ?? []);
    const map: Record<string, string[]> = {};
    (utRows ?? []).forEach((r: any) => {
      (map[r.user_id] = map[r.user_id] || []).push(r.tag_id);
    });
    setUserTagMap(map);

    const creditMap = new Map<string, number>((credRows ?? []).map((c: any) => [c.user_id, Number(c.balance) || 0]));
    const byUser = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rows: ConvRow[] = convList.map((c) => {
      const p = byUser.get(c.user_id);
      const convMsgs = (msgs ?? []).filter((m) => m.conversation_id === c.id);
      const lastMsg = convMsgs[0];
      const unread = convMsgs.filter((m) => !m.from_page && !m.seen).length;

      // Find most recent call associated with this user
      const userCalls = (supportCalls ?? []).filter((call) => call.caller_id === c.user_id || call.callee_id === c.user_id);
      const lastCall = userCalls[0];

      let lastMessage = lastMsg?.content ?? null;
      if (lastMessage?.startsWith("[system:reaction:")) {
        lastMessage = "Reacted to a message";
      } else if (lastMessage?.startsWith("[system:pin:")) {
        lastMessage = "Pinned a message";
      } else if (lastMessage?.startsWith("[system:unpin:")) {
        lastMessage = "Unpinned a message";
      } else if (lastMessage?.startsWith("[system:unsent]")) {
        lastMessage = "Unsent a message";
      } else if (lastMessage?.startsWith("[system:forwarded] ")) {
        lastMessage = lastMessage.slice("[system:forwarded] ".length);
      } else if (lastMessage?.startsWith("[system:forwarded]")) {
        lastMessage = lastMessage.slice("[system:forwarded]".length).trim() || (lastMsg?.image_url ? "📷 Photo" : lastMsg?.audio_url ? "🎤 Voice message" : "Forwarded message");
      } else if (lastMessage === "[system:forwarded]") {
        lastMessage = lastMsg?.image_url ? "📷 Photo" : lastMsg?.audio_url ? "🎤 Voice message" : "Forwarded message";
      } else if (lastMessage?.startsWith("[reply:")) {
        const match = lastMessage.match(/^\[reply:[^\]]+\]\s*([\s\S]*)/);
        if (match) lastMessage = match[1];
      }
      let lastAt = lastMsg?.created_at ?? null;

      if (lastCall && (!lastAt || new Date(lastCall.created_at) > new Date(lastAt))) {
        lastMessage = lastCall.call_type === "video" ? "📹 Video call" : "📞 Voice call";
        lastAt = lastCall.created_at;
      }

      return {
        conversationId: c.id,
        userId: c.user_id,
        username: p?.username ?? "(unknown)",
        avatar_url: p?.avatar_url ?? null,
        online: p?.online ?? false,
        last_seen: p?.last_seen ?? c.last_message_at,
        lastMessage,
        lastAt,
        unread,
        credit: creditMap.get(c.user_id) ?? 0,
        isSpam: (c as any).is_spam ?? false,
      };
    });

    // Sort conversations strictly by most recent activity
    rows.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

    setConvs(rows);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-page-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "page_messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "page_conversations" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_tags" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tags" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_credits" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  // Optimistically clear unread badges for the active conversation
  useEffect(() => {
    if (activeId) {
      setConvs((prev) =>
        prev.map((c) => (c.conversationId === activeId ? { ...c, unread: 0 } : c))
      );
    }
  }, [activeId]);

  const filtered = convs.filter((u) => {
    if (viewSpam ? !u.isSpam : u.isSpam) return false;
    if (search && !u.username.toLowerCase().includes(search.toLowerCase())) return false;
    if (tagFilter && !(userTagMap[u.userId] ?? []).includes(tagFilter)) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    const aPinned = pinnedConvs.includes(a.conversationId);
    const bPinned = pinnedConvs.includes(b.conversationId);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });
  const spamCount = convs.filter((u) => u.isSpam).length;
  const active = convs.find((u) => u.conversationId === activeId) ?? null;

  async function setConvSpam(conv: ConvRow, next: boolean) {
    const { error } = await supabase
      .from("page_conversations")
      .update({ is_spam: next } as any)
      .eq("id", conv.conversationId);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Moved to spam" : "Removed from spam");
    setConvs((prev) => prev.map((c) => c.conversationId === conv.conversationId ? { ...c, isSpam: next } : c));
    if (next && active?.conversationId === conv.conversationId) setActiveId(null);
  }

    const onlineUsers = convs.filter((u) => u.online && !u.isSpam);

    return (
      <div className="flex h-full min-h-0">
        {/* List — hidden on mobile when a conversation is open */}
        <div className={`${active ? "hidden sm:flex" : "flex"} w-full sm:w-80 border-r border-border bg-card flex-col min-h-0`}>
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3 sm:mb-1">
              <button
                onClick={onOpenNav}
                className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary shrink-0"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex-1">
                <h2 className="text-lg font-bold leading-tight">Jackpot Jungle</h2>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Page Inbox</p>
              </div>
            </div>
            <div className="relative mt-3">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-full bg-secondary border-transparent"
              />
            </div>
            {onlineUsers.length > 0 && (
              <div className="flex items-center gap-4 py-2 mt-3 overflow-x-auto no-scrollbar">
                {onlineUsers.map((f) => (
                  <button
                    key={f.conversationId}
                    onClick={() => setActiveId(f.conversationId)}
                    className="flex flex-col items-center shrink-0 w-[56px] text-center group cursor-pointer"
                  >
                    <div className="relative">
                      <Avatar name={f.username} url={f.avatar_url} size={40} />
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background" />
                    </div>
                    <span className="text-[10px] font-medium text-foreground mt-1 truncate w-full group-hover:underline">
                      {f.username.split(" ")[0]}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1.5 mt-3 overflow-x-auto -mx-1 px-1 pb-1">
            <button
              onClick={() => { setViewSpam(false); setTagFilter(null); }}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border ${!viewSpam && tagFilter === null ? "bg-primary text-primary-foreground border-transparent" : "bg-secondary border-transparent text-muted-foreground"}`}
            >
              All
            </button>
            {allTags.map((t) => {
              const on = !viewSpam && tagFilter === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setViewSpam(false); setTagFilter(on ? null : t.id); }}
                  className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border ${on ? "border-transparent text-white" : "border-border text-muted-foreground"}`}
                  style={on ? { background: t.color } : {}}
                >
                  {t.name}
                </button>
              );
            })}
            <button
              onClick={() => { setViewSpam(true); setTagFilter(null); }}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border inline-flex items-center gap-1 ${viewSpam ? "bg-destructive text-destructive-foreground border-transparent" : "bg-secondary border-transparent text-muted-foreground"}`}
            >
              <Ban className="h-3 w-3" /> Spam{spamCount > 0 ? ` (${spamCount})` : ""}
            </button>
          </div>
        </div>
        <PullToRefresh onRefresh={load}>
          {sorted.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{viewSpam ? "No spam conversations." : "No conversations."}</p>
          ) : sorted.map((u) => {
            const startPress = () => {
              if (pressTimer.current) clearTimeout(pressTimer.current);
              pressTimer.current = setTimeout(() => setContextMenuTarget(u.conversationId), 600);
            };
            const cancelPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
            const isPinned = pinnedConvs.includes(u.conversationId);
            return (
            <div key={u.conversationId} className="group relative">
            <button
              onClick={() => setActiveId(u.conversationId)}
              onPointerDown={startPress}
              onPointerUp={cancelPress}
              onPointerMove={cancelPress}
              onPointerLeave={cancelPress}
              onContextMenu={(e) => { e.preventDefault(); setContextMenuTarget(u.conversationId); }}
              className={`w-full flex items-center gap-3 px-3 py-3 mx-2 my-1 rounded-xl text-left hover:bg-secondary transition-colors select-none ${activeId === u.conversationId ? "bg-secondary" : ""}`}
            >
              <div className="relative shrink-0">
                <Avatar name={u.username} url={u.avatar_url} size={44} />
                {u.online && !u.isSpam && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
              </div>
              <div className="flex-1 min-w-0 pr-9">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate text-sm flex items-center gap-1.5 ${u.unread ? "font-bold" : "font-semibold"}`}>
                    {u.username}
                    {isPinned && <Pin className="h-3.5 w-3.5 text-primary rotate-45 fill-primary shrink-0" />}
                  </p>
                  {u.lastAt && <span className="text-[11px] text-muted-foreground shrink-0">{formatDistanceToNow(new Date(u.lastAt), { addSuffix: false })}</span>}
                </div>
                <p className={`text-xs truncate ${u.unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {u.lastMessage ?? "No messages yet"}
                </p>
                <div className="flex gap-1 mt-1 flex-wrap items-center">
                  {u.credit > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                      Credit ${u.credit.toFixed(2)}
                    </span>
                  )}
                  {(userTagMap[u.userId] ?? []).slice(0, 3).map((tid) => {
                    const t = allTags.find((x) => x.id === tid);
                    if (!t) return null;
                    return <span key={tid} className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-semibold" style={{ background: t.color }}>{t.name}</span>;
                  })}
                </div>
              </div>
              {!!u.unread && <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-[10px] text-primary-foreground font-bold flex items-center justify-center shrink-0">{u.unread}</span>}
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConvSpam(u, !u.isSpam); }}
              title={u.isSpam ? "Remove from spam" : "Move to spam"}
              aria-label={u.isSpam ? "Remove from spam" : "Move to spam"}
              className={`absolute right-4 top-3 h-7 w-7 rounded-full bg-background border border-border items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-opacity flex ${u.isSpam ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
            >
              {u.isSpam ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            </button>
            </div>
            );
          })}
        </PullToRefresh>
      </div>

      {/* Conversation pane — full screen on mobile when open */}
      <div className={`${active ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col bg-background min-h-0`}>
        {active ? (
          <Conversation 
            meId={meId} 
            conv={active} 
            convs={convs} 
            onBack={() => setActiveId(null)} 
            onOpenDetail={() => setDetailOpen(true)} 
            onToggleSpam={() => setConvSpam(active, !active.isSpam)} 
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 text-muted-foreground">
            <Inbox className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Select a conversation to reply as the page.</p>
          </div>
        )}
      </div>

      {active && <UserDetailPanel userId={active.userId} username={active.username} avatar={active.avatar_url} />}

      {/* Mobile/tablet: detail sheet (panel is hidden lg:flex by default) */}
      <Sheet open={detailOpen && !!active} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 lg:hidden">
          {active && <UserDetailPanel userId={active.userId} username={active.username} avatar={active.avatar_url} variant="embedded" onClose={() => setDetailOpen(false)} />}
        </SheetContent>
      </Sheet>

      {contextMenuTarget && (() => {
        const targetConv = convs.find(c => c.conversationId === contextMenuTarget);
        if (!targetConv) return null;
        const isPinned = pinnedConvs.includes(contextMenuTarget);
        const isSpam = targetConv.isSpam;

        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setContextMenuTarget(null)} />
            <div className="relative w-full max-w-[280px] bg-card border border-border rounded-2xl shadow-2xl p-4 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center pb-3 border-b border-border">
                <Avatar name={targetConv.username} url={targetConv.avatar_url} size={56} />
                <h3 className="font-bold text-base mt-2 text-foreground truncate w-full">{targetConv.username}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Manage conversation options</p>
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
                  <span>{isPinned ? "Unpin conversation" : "Pin conversation"}</span>
                </button>
                <button
                  onClick={async () => {
                    await setConvSpam(targetConv, !isSpam);
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
    </div>
  );
}

type PageMsg = { id: string; sender_id: string; content: string | null; image_url: string | null; audio_url: string | null; created_at: string; seen: boolean; from_page: boolean; failed?: boolean };
type CallRow = { id: string; caller_id: string; callee_id: string; call_type: "voice" | "video"; status: "ringing" | "active" | "ended" | "missed" | "declined" | "canceled"; duration_seconds: number; created_at: string };

function Conversation({ 
  meId, 
  conv, 
  convs = [], 
  onBack, 
  onOpenDetail, 
  onToggleSpam 
}: { 
  meId: string; 
  conv: ConvRow; 
  convs?: ConvRow[]; 
  onBack: () => void; 
  onOpenDetail: () => void; 
  onToggleSpam: () => void 
}) {
  const { startCall } = useCalls();
  const [messages, setMessages] = useState<PageMsg[]>([]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const [forwardTargetMsg, setForwardTargetMsg] = useState<PageMsg | null>(null);
  const [forwardingTargetId, setForwardingTargetId] = useState<string | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");

  async function executeForward(target: ConvRow) {
    if (!forwardTargetMsg || !meId) return;
    setForwardingTargetId(target.conversationId);
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

      const { error } = await supabase.from("page_messages").insert({
        conversation_id: target.conversationId,
        sender_id: meId,
        from_page: true,
        content: newContent,
        image_url: forwardTargetMsg.image_url,
        audio_url: forwardTargetMsg.audio_url
      } as any);
      if (error) throw error;
      toast.success(`Message forwarded to ${target.username}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to forward message");
    } finally {
      setForwardingTargetId(null);
      setForwardTargetMsg(null);
    }
  }
  const isNearBottomRef = useRef(true);
  const isInitialLoadRef = useRef(true);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recUploading, setRecUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [quickReplies, setQuickReplies] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [unsendId, setUnsendId] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set());
  const [deletedForMeIds, setDeletedForMeIds] = useState<Set<string>>(new Set());
  const [showDeleteBottomSheet, setShowDeleteBottomSheet] = useState(false);

  useEffect(() => {
    const list = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
    setDeletedForMeIds(new Set(list));
  }, []);

  const deleteForMe = (ids: string[]) => {
    const nextList = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
    const nextSet = new Set<string>([...nextList, ...ids]);
    localStorage.setItem("jj_deleted_messages", JSON.stringify(Array.from(nextSet)));
    setDeletedForMeIds(nextSet);
  };

  const allSelectedAreMine = useMemo(() => {
    if (selectedMsgs.size === 0) return false;
    for (const id of selectedMsgs) {
      const msg = messages.find(x => x.id === id);
      if (!msg || !msg.from_page) return false;
    }
    return true;
  }, [selectedMsgs, messages]);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, [conv.conversationId]);

  const matchIds = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages.filter((m) => m.content && m.content.toLowerCase().includes(q)).map((m) => m.id);
  })();

  useEffect(() => {
    if (!searchOpen || matchIds.length === 0) return;
    const idx = Math.min(activeMatch, matchIds.length - 1);
    const el = msgRefs.current[matchIds[idx]];
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

  useEffect(() => {
    supabase.from("quick_replies").select("id, title, content").then(({ data }) => setQuickReplies(data ?? []));
  }, []);

  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const trimmed = text.trim().toLowerCase();
  const suggestions = trimmed && !text.includes("\n") && text !== dismissedFor
    ? quickReplies.filter((q) => q.title.toLowerCase().includes(trimmed)).slice(0, 5)
    : [];

  function applyReply(q: { content: string }) {
    setText(q.content);
    setSuggestIdx(0);
    setDismissedFor(q.content);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function load() {
    const cacheKey = `admin-page-${conv.conversationId}`;
    const cached = getCachedPageMessages(cacheKey);
    if (cached && messages.length === 0) {
      setMessages(cached);
    }

    const lastCachedMsg = cached && cached.length > 0 ? cached[cached.length - 1] : null;

    if (lastCachedMsg) {
      const [{ data: deltaMsgs }, { data: callRows }] = await Promise.all([
        supabase
          .from("page_messages")
          .select("id, sender_id, content, image_url, audio_url, created_at, seen, from_page")
          .eq("conversation_id", conv.conversationId)
          .gt("created_at", lastCachedMsg.created_at)
          .order("created_at", { ascending: true }),
        supabase
          .from("calls")
          .select("id, caller_id, callee_id, call_type, status, duration_seconds, created_at")
          .eq("context", "page")
          .eq("page_conversation_id", conv.conversationId)
          .order("created_at", { ascending: true })
          .limit(200),
      ]);
      const delta = (deltaMsgs ?? []) as PageMsg[];
      const combined = [...(cached || [])];
      delta.forEach((m) => {
        if (!combined.some((x) => x.id === m.id)) {
          combined.push(m);
        }
      });
      setMessages(combined);
      setCachedPageMessages(cacheKey, combined);
      setCalls(((callRows ?? []) as CallRow[]).filter((c) => c.status !== "ringing" && c.status !== "active"));
    } else {
      const [{ data }, { data: callRows }] = await Promise.all([
        supabase
          .from("page_messages")
          .select("id, sender_id, content, image_url, audio_url, created_at, seen, from_page")
          .eq("conversation_id", conv.conversationId)
          .order("created_at", { ascending: true }),
        supabase
          .from("calls")
          .select("id, caller_id, callee_id, call_type, status, duration_seconds, created_at")
          .eq("context", "page")
          .eq("page_conversation_id", conv.conversationId)
          .order("created_at", { ascending: true })
          .limit(200),
      ]);
      const fresh = (data as PageMsg[]) ?? [];
      setMessages(fresh);
      setCachedPageMessages(cacheKey, fresh);
      setCalls(((callRows ?? []) as CallRow[]).filter((c) => c.status !== "ringing" && c.status !== "active"));
    }

    await supabase.from("page_messages").update({ seen: true })
      .eq("conversation_id", conv.conversationId).eq("from_page", false).eq("seen", false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`admin-page-conv-${conv.conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "page_messages", filter: `conversation_id=eq.${conv.conversationId}` }, (payload) => {
        const m = payload.new as PageMsg;
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          const idx = prev.findIndex((x) =>
            typeof x.id === "string" && x.id.startsWith("temp-") &&
            x.from_page === m.from_page &&
            (x.content ?? null) === (m.content ?? null) &&
            (x.image_url ?? null) === (m.image_url ?? null) &&
            (x.audio_url ?? null) === (m.audio_url ?? null)
          );
          if (idx >= 0) { const copy = prev.slice(); copy[idx] = m; return copy; }
          const next = [...prev, m];
          setCachedPageMessages(`admin-page-${conv.conversationId}`, next);
          return next;
        });
        if (!m.from_page) {
          supabase.from("page_messages").update({ seen: true }).eq("id", m.id).then();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "page_messages", filter: `conversation_id=eq.${conv.conversationId}` }, (payload) => {
        const m = payload.new as PageMsg;
        setMessages((prev) => {
          const next = prev.map((x) => (x.id === m.id ? m : x));
          setCachedPageMessages(`admin-page-${conv.conversationId}`, next);
          return next;
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "page_messages", filter: `conversation_id=eq.${conv.conversationId}` }, (payload) => {
        const m = payload.old as PageMsg;
        setMessages((prev) => {
          const next = prev.filter((x) => x.id !== m.id);
          setCachedPageMessages(`admin-page-${conv.conversationId}`, next);
          return next;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `page_conversation_id=eq.${conv.conversationId}` }, (payload) => {
        const row = (payload.new ?? payload.old) as CallRow;
        if (!row || row.status === "ringing" || row.status === "active") return;
        setCalls((prev) => {
          const exists = prev.some((c) => c.id === row.id);
          if (exists) return prev.map((c) => (c.id === row.id ? row : c));
          return [...prev, row];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.conversationId]);

  useEffect(() => {
    if (messages.length > 0 && isInitialLoadRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      isInitialLoadRef.current = false;
    } else {
      const lastMsg = messages[messages.length - 1];
      const isMine = lastMsg && lastMsg.from_page;
      if (isMine || isNearBottomRef.current) {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        setShowScrollToBottom(false);
      } else {
        setShowScrollToBottom(true);
      }
    }
  }, [messages, calls]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isNear = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    isNearBottomRef.current = isNear;
    if (isNear) {
      setShowScrollToBottom(false);
    }
  };

  const handleSelect = useCallback((id: string) => {
    setSelectedMsgs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handlePin = useCallback((id: string) => {
    setConfirmPinTarget(id);
  }, []);

  const handleUnpin = useCallback((id: string) => {
    if (!meId) return;
    supabase.from("page_messages").insert({
      conversation_id: conv.conversationId,
      sender_id: meId,
      from_page: true,
      content: `[system:unpin:${id}]`,
      seen: true,
    } as any).then();
  }, [meId, conv.conversationId]);

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

  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [confirmPinTarget, setConfirmPinTarget] = useState<string | null>(null);
  const [activeMsgMenu, setActiveMsgMenu] = useState<string | null>(null);
  const [showAllPins, setShowAllPins] = useState(false);

  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const parsedMessages = useMemo(() => {
    const visible: Array<PageMsg & {
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
    const { data, error } = await supabase.from("page_messages").insert({
      conversation_id: conv.conversationId,
      sender_id: meId,
      from_page: true,
      content: reactionContent,
      seen: true,
    } as any).select().single();
    if (error) {
      toast.error("Failed to update reaction");
    } else {
      setMessages(prev => [...prev, data as PageMsg]);
    }
  }

  async function pinMessage(msgId: string) {
    if (!meId) return;
    const pinContent = `[system:pin:${msgId}]`;
    const { data, error } = await supabase.from("page_messages").insert({
      conversation_id: conv.conversationId,
      sender_id: meId,
      from_page: true,
      content: pinContent,
      seen: true,
    } as any).select().single();
    if (error) {
      toast.error("Failed to pin message");
    } else {
      setMessages(prev => [...prev, data as PageMsg]);
      toast.success("Message pinned");
    }
  }

  async function unpinMessage(msgId: string) {
    if (!meId) return;
    const unpinContent = `[system:unpin:${msgId}]`;
    const { data, error } = await supabase.from("page_messages").insert({
      conversation_id: conv.conversationId,
      sender_id: meId,
      from_page: true,
      content: unpinContent,
      seen: true,
    } as any).select().single();
    if (error) {
      toast.error("Failed to unpin message");
    } else {
      setMessages(prev => [...prev, data as PageMsg]);
      toast.success("Message unpinned");
    }
  }

  function addOptimistic(partial: Partial<PageMsg>): string {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: PageMsg = {
      id: tempId,
      sender_id: meId,
      from_page: true,
      content: null,
      image_url: null,
      audio_url: null,
      seen: false,
      created_at: new Date().toISOString(),
      ...partial,
    } as PageMsg;
    setMessages((prev) => [...prev, optimistic]);
    return tempId;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();
    setText("");

    const replyPrefix = replyingTo
      ? `[reply:${replyingTo.id}:${replyingTo.from_page ? "You" : (conv?.username || "User")}:${replyingTo.content ? replyingTo.content.slice(0, 30) : replyingTo.image_url ? "Image 📷" : replyingTo.audio_url ? "Voice message 🎙️" : "Message"}] `
      : "";
    const finalContent = replyPrefix + content;
    setReplyingTo(null);

    const tempId = addOptimistic({ content });
    const { data, error } = await supabase
      .from("page_messages")
      .insert({ conversation_id: conv.conversationId, sender_id: meId, from_page: true, content: finalContent })
      .select()
      .single();
    if (error) {
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
      toast.error(error.message);
      return;
    }
    if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as PageMsg) : x)));
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // Static image validation
    const fileMime = file.type.toLowerCase();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (fileMime === "image/gif" || ext === "gif") {
      toast.error("GIF files are not supported. Please choose a static image.");
      return;
    }
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    const allowedExts = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
    if (!allowedMimes.includes(fileMime) && !allowedExts.includes(ext)) {
      toast.error("Unsupported format. Please choose a JPEG, PNG, WEBP, or HEIC image.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) { toast.error("Max 8 MB"); return; }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    const tempId = addOptimistic({ image_url: localPreview });
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("chat-images", meId, file, ext, file.type);
      const { data, error } = await supabase
        .from("page_messages")
        .insert({ conversation_id: conv.conversationId, sender_id: meId, from_page: true, content: null, image_url: url } as any)
        .select()
        .single();
      if (error) throw error;
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as PageMsg) : x)));
    } catch (err: any) {
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
      toast.error(err?.message ?? "Upload failed");
    }
    setUploading(false);
  }

  async function onVoice(blob: Blob, mime: string, ext: string) {
    setRecUploading(true);
    const localPreview = URL.createObjectURL(blob);
    const tempId = addOptimistic({ audio_url: localPreview });
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("chat-audio", meId, blob, ext, mime);
      const { data, error } = await supabase
        .from("page_messages")
        .insert({ conversation_id: conv.conversationId, sender_id: meId, from_page: true, content: null, audio_url: url } as any)
        .select()
        .single();
      if (error) throw error;
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as PageMsg) : x)));
    } catch (err: any) {
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
      toast.error(err?.message ?? "Voice upload failed");
    }
    setRecUploading(false);
  }

  return (
    <>
      {selectionMode ? (
        <div className="px-3 sm:px-5 py-3 border-b border-border bg-card flex items-center justify-between min-h-[61px]">
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
        </div>
      ) : (
        <div className="px-3 sm:px-5 py-3 border-b border-border bg-card flex items-center gap-3">
          <button onClick={onBack} className="sm:hidden h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary -ml-1" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            onClick={onOpenDetail}
            className="flex-1 min-w-0 flex items-center gap-3 -mx-1 px-1 py-1 rounded-lg lg:cursor-default lg:hover:bg-transparent hover:bg-secondary text-left"
            aria-label="Open user details"
          >
            <Avatar name={conv.username} url={conv.avatar_url} size={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm truncate">{conv.username}</p>
                {conv.credit > 0 && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                    Credit ${conv.credit.toFixed(2)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{conv.online ? "Active now" : `Last seen ${formatDistanceToNow(new Date(conv.last_seen), { addSuffix: true })}`}</p>
            </div>
          </button>
          <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary hidden md:inline">Replying as page</span>
          <button
            type="button"
            onClick={() => startCall({ calleeId: conv.userId, kind: "voice", peer: { name: conv.username, avatar: conv.avatar_url }, context: "page", pageConversationId: conv.conversationId })}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-primary/10"
            aria-label="Voice call"
            title="Voice call"
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => startCall({ calleeId: conv.userId, kind: "video", peer: { name: conv.username, avatar: conv.avatar_url }, context: "page", pageConversationId: conv.conversationId })}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-primary/10"
            aria-label="Video call"
            title="Video call"
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
        </div>
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

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto smooth-scroll px-5 py-4 space-y-2 relative">
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

        {parsedMessages.length === 0 && calls.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">No messages yet.</p>
        ) : (() => {
          type TimelineItem = { kind: "msg"; at: string; msg: typeof parsedMessages[0] } | { kind: "call"; at: string; call: CallRow };
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
                      status={c.status} 
                      durationSeconds={c.duration_seconds} 
                      onCallBack={() => startCall({ calleeId: conv.userId, kind: c.call_type, peer: { name: conv.username, avatar: conv.avatar_url }, context: "page", pageConversationId: conv.conversationId })}
                    />
                  </div>
                </div>
              );
            }
            const m = it.msg;
            const mine = m.from_page;
            const nextIt = items[i + 1];
            const isLastMine = mine && (!nextIt || nextIt.kind !== "msg" || !nextIt.msg.from_page);

            return (
              <AdminConversationMessageItem
                key={m.id}
                m={m}
                meId={meId}
                conv={conv}
                isLastMine={isLastMine}
                showTime={showTime}
                selectionMode={selectionMode}
                isSelected={selectedMsgs.has(m.id)}
                msgRefs={msgRefs}
                onSelect={handleSelect}
                onPin={handlePin}
                onUnpin={handleUnpin}
                onReply={handleReply}
                onCopy={handleCopy}
                onDelete={handleDelete}
                onForward={handleForward}
                onPreviewImage={handlePreviewImage}
                onMenuOpen={handleMenuOpen}
                searchQuery={searchQuery}
                highlight={highlight}
                matchIds={matchIds}
                activeMatch={activeMatch}
              />
            );
          });
        })()}
      </div>

      {replyingTo && (
        <div className="px-4 py-2 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground reply-preview-enter animate-in slide-in-from-bottom-2 duration-200">
          <div className="truncate flex-1">
            <span className="font-bold text-primary block text-[10px] uppercase">Replying to {replyingTo.from_page ? "yourself" : (conv?.username || "User")}</span>
            <span className="truncate block italic">{replyingTo.content || "Media / Attachment"}</span>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)} className="h-6 w-6 rounded-full hover:bg-secondary flex items-center justify-center ml-2 shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {selectionMode ? (
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
        <form onSubmit={send} className="relative p-3 border-t border-border bg-card flex items-center gap-2">
          {suggestions.length > 0 && (
            <div className="absolute left-3 right-3 bottom-full mb-2 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-20">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/50 flex items-center gap-1">
                <MessageSquareQuote className="h-3 w-3" /> Saved replies · Tab to insert
              </div>
              {suggestions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onMouseEnter={() => setSuggestIdx(i)}
                  onClick={() => applyReply(q)}
                  className={`w-full text-left px-3 py-2 hover:bg-secondary ${i === suggestIdx ? "bg-secondary" : ""}`}
                >
                  <p className="text-xs font-bold">{q.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{q.content}</p>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50" aria-label="Send image">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
          <VoiceRecorder onRecorded={onVoice} uploading={recUploading} />
          <Input
            ref={inputRef}
            autoFocus
            placeholder="Reply as Jackpot Jungle…"
            value={text}
            onChange={(e) => { setText(e.target.value); setSuggestIdx(0); }}
            onKeyDown={(e) => {
              if (suggestions.length === 0) return;
              if (e.key === "Tab" || (e.key === "Enter" && suggestions.length > 0 && text.length < suggestions[suggestIdx].content.length)) {
                e.preventDefault();
                applyReply(suggestions[suggestIdx]);
              } else if (e.key === "ArrowDown") { e.preventDefault(); setSuggestIdx((i) => (i + 1) % suggestions.length); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length); }
              else if (e.key === "Escape") { setSuggestIdx(0); }
            }}
            className="flex-1 min-w-0 rounded-full bg-secondary border-transparent h-11" />
          <Button type="submit" size="icon" disabled={!text.trim()} className="rounded-full h-11 w-11 shrink-0 send-btn-active">
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
        const mine = m.from_page;

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
                        {m.from_page ? "You" : (conv?.username || "User")}
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
                    await unsendPageMessagesServer({ data: { ids: targetIds } });
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

      {/* Forward Modal */}
      {forwardTargetMsg && (() => {
        const filteredCandidates = convs.filter((c) =>
          c.username.toLowerCase().includes(forwardSearch.toLowerCase())
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
                    placeholder="Search conversations"
                    value={forwardSearch}
                    onChange={(e) => setForwardSearch(e.target.value)}
                    className="pl-9 rounded-full bg-secondary/40 border-transparent text-xs h-8 focus:bg-secondary/60 focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {convs.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-6">No active conversations found.</p>
                ) : filteredCandidates.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-6">No matching conversations found.</p>
                ) : (
                  filteredCandidates.map((c) => (
                    <div key={c.conversationId} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-secondary/15 border border-border/20 hover:bg-secondary/35 transition-colors animate-in slide-in-from-bottom-2 duration-150">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={c.username} url={c.avatar_url} size={36} />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{c.username}</p>
                          {c.credit > 0 && (
                            <p className="text-[10px] text-emerald-500 font-semibold leading-none">Credit ${c.credit.toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                      <Button 
                        onClick={() => executeForward(c)} 
                        disabled={forwardingTargetId !== null} 
                        size="sm" 
                        className="rounded-full shrink-0 shadow-sm"
                      >
                        {forwardingTargetId === c.conversationId ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}


/* ---------------- ADMINS (super admin only) ---------------- */

type AdminRow = {
  user_id: string;
  role: AppRole;
  username: string;
  avatar_url: string | null;
};

function AdminsView({ onOpenNav }: { onOpenNav: () => void }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminRow | null>(null);

  async function load() {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "super_admin"]);
    if (!roles) return;
    const ids = [...new Set(roles.map((r) => r.user_id))];
    if (ids.length === 0) { setRows([]); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", ids);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    setRows(roles.map((r) => {
      const p = byId.get(r.user_id) as { username?: string; avatar_url?: string | null } | undefined;
      return {
        user_id: r.user_id, role: r.role as AppRole,
        username: p?.username ?? "(unknown)",
        avatar_url: p?.avatar_url ?? null,
      };
    }).sort((a, b) => (a.role === "super_admin" ? -1 : 1)));
  }

  useEffect(() => { load(); }, []);

  async function doRevoke() {
    const row = revokeTarget;
    if (!row) return;
    setRevokeTarget(null);
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", row.user_id)
      .eq("role", row.role);
    if (error) return toast.error(error.message);
    toast.success("Revoked.");
    load();
  }

  const filtered = rows.filter((r) =>
    !search || r.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-3 py-3 flex items-center gap-2">
        <button onClick={onOpenNav} className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary">
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="font-bold">Admin team</h2>
      </div>
      <div className="p-6 lg:p-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="hidden md:block">
              <h1 className="text-2xl font-bold">Admin team</h1>
              <p className="text-sm text-muted-foreground mt-1">Promote users to admin or super admin.</p>
            </div>
            <Button onClick={() => setAddOpen(true)} className="rounded-full gap-2 ml-auto">
              <Plus className="h-4 w-4" /> Add admin
            </Button>
          </div>

          <div className="relative mb-4">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search admins"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-full bg-secondary border-transparent max-w-sm"
            />
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No admins yet.</p>
            ) : filtered.map((r) => (
              <div key={`${r.user_id}-${r.role}`} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
                <Avatar name={r.username} url={r.avatar_url} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{r.username}</p>
                </div>
                <span className={`text-[11px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full ${r.role === "super_admin" ? "bg-primary/15 text-primary" : "bg-secondary text-foreground"}`}>
                  {r.role === "super_admin" ? "Super admin" : "Admin"}
                </span>
                <button
                  onClick={() => setRevokeTarget(r)}
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Revoke role"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {addOpen && <AddAdminDialog onClose={() => { setAddOpen(false); load(); }} />}

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.role.replace("_", " ")}?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.username} will lose {revokeTarget?.role === "super_admin" ? "super admin" : "admin"} access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={doRevoke}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddAdminDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; username: string; avatar_url: string | null }>>([]);
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query.trim()) { setResults([]); return; }
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .or(`username.ilike.%${query}%,friend_code.ilike.%${query}%`)
        .limit(8);
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  async function promote(userId: string) {
    setBusy(true);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Granted ${role.replace("_", " ")}.`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Add admin</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-5 w-5 rotate-45" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setRole("admin")} className={`flex-1 h-10 rounded-lg text-sm font-medium ${role === "admin" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>Admin</button>
              <button onClick={() => setRole("super_admin")} className={`flex-1 h-10 rounded-lg text-sm font-medium ${role === "super_admin" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>Super admin</button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Search user</label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Username or friend code"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {results.map((r) => (
              <button
                key={r.id}
                disabled={busy}
                onClick={() => promote(r.id)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary text-left disabled:opacity-50"
              >
                <Avatar name={r.username} url={r.avatar_url} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{r.username}</p>
                  <p className="text-xs text-muted-foreground truncate">ID {r.id.slice(0, 8)}…</p>
                </div>
                <Plus className="h-4 w-4 text-primary" />
              </button>
            ))}
            {query && results.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">No matches.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AdminConversationMessageItemProps {
  m: any;
  meId: string;
  conv: ConvRow;
  isLastMine: boolean;
  showTime: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  msgRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onSelect: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onReply: (m: any) => void;
  onCopy: (text: string) => void;
  onDelete: (id: string) => void;
  onForward: (m: any) => void;
  onPreviewImage: (url: string) => void;
  onMenuOpen: (id: string) => void;
  searchQuery: string;
  highlight: (text: string, query: string) => React.ReactNode;
  matchIds: string[];
  activeMatch: number;
}

const AdminConversationMessageItem = React.memo(function AdminConversationMessageItem({
  m,
  meId,
  conv,
  isLastMine,
  showTime,
  selectionMode,
  isSelected,
  msgRefs,
  onSelect,
  onPin,
  onUnpin,
  onReply,
  onCopy,
  onDelete,
  onForward,
  onPreviewImage,
  onMenuOpen,
  searchQuery,
  highlight,
  matchIds,
  activeMatch,
}: AdminConversationMessageItemProps) {
  const mine = m.from_page;
  const reactionKeys = Object.keys(m.reactions).filter(k => m.reactions[k].length > 0);
  const isMatch = matchIds.includes(m.id);
  const isActiveMatch = isMatch && matchIds[activeMatch] === m.id;

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
        {mine ? "You pinned a message" : `${conv.username || "User"} pinned a message`}
      </div>
    );
  }

  if (m.isSystemUnpin) {
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic flex items-center justify-center gap-1">
        <Pin className="h-3 w-3 rotate-45 text-muted-foreground/40" />
        {mine ? "You unpinned a message" : `${conv.username || "User"} unpinned a message`}
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
        {showTime && (
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
              onClick={() => m.replyTo && msgRefs.current[m.replyTo.id]?.scrollIntoView({ behavior: "smooth", block: "center" })}
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
              <button onClick={() => onPreviewImage(toCDNUrl(m.image_url))} className="max-w-[200px] rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary block select-none">
                <img src={toCDNUrl(m.image_url)} alt="" className="block max-h-72 w-auto object-cover" />
              </button>
            ) : m.audio_url ? (
              <div className="block"><VoiceMessage src={toCDNUrl(m.audio_url)} mine={mine} /></div>
            ) : (
              <div className={`max-w-[240px] rounded-2xl px-4 py-2 text-sm select-none cursor-pointer ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"} ${isActiveMatch ? "ring-2 ring-primary" : ""}`}>
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
              <span className="inline-flex items-center gap-1 text-destructive"><span className="h-2 w-2 rounded-full bg-destructive shrink-0" />Not delivered</span>
            ) : m.id.startsWith("temp-") ? (
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-message-status/60 animate-pulse shrink-0" />Sending…</span>
            ) : m.seen ? (
              <span className="inline-flex items-center gap-1">
                {conv.avatar_url ? <img src={conv.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full object-cover ring-1 ring-border" /> : <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />}
                Seen
              </span>
            ) : (
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-message-status/60 shrink-0" />Delivered</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

