import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toCDNUrl } from "@/config";
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSystemMessage, isSystemMessage } from "@/lib/chat-helpers";
import { useRole, type AppRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { Capacitor } from "@capacitor/core";
import { useNativePush } from "@/hooks/useNativePush";
import { useQueryClient } from "@tanstack/react-query";
import { setVerifiedStatus } from "@/lib/auth-wait";
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
  Eye,
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
  Info,



  User as UserIcon,
  UserPlus,
  LogOut,
  Loader2,
  ImageIcon,
  Tag as TagIcon,
  MessageSquareQuote,
  MessageSquare,
  Megaphone,
  Bell,
  Bot,
  Activity,
  Gift,
  Settings as SettingsIcon,
  Pin,
  BookOpen,
  Edit,
  ShieldCheck,
  Wallet,
  Coins,
  ArrowRightLeft,
  Printer,
  Download,
  Mail,
  History,
  FileText,
  PlusCircle,
  MinusCircle,
} from "lucide-react";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { VoiceMessage } from "@/components/messenger/VoiceMessage";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { unsendPageMessagesServer, unsendMessagesServer } from "@/lib/messages.functions";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  PushNotificationsAdminView,
} from "@/components/admin/AdminViews";
import { SystemAnnouncementsAdminView } from "@/components/admin/SystemAnnouncementsAdmin";
import { UsersManagementView } from "@/components/admin/UsersManagement";
import { MonitorChatsView } from "@/components/admin/MonitorChatsView";
import { MonthlyProfitView } from "@/components/admin/MonthlyProfit";
import { SignOutDialog } from "@/components/messenger/SignOutDialog";
import { CreateGroupModal } from "./chat";
import { ShareProfileModal } from "@/components/messenger/ShareProfileModal";
import { GroupDetailPanel, GroupAddMembersModal, GroupShareModal } from "./chat.$friendId";

type Tab =
  | "inbox"
  | "teamchat"
  | "quickreplies"
  | "tags"
  | "broadcasts"
  | "followups"
  | "autoresp"
  | "referrals"
  | "logs"
  | "users"
  | "admins"
  | "super"
  | "profile"
  | "rules"
  | "updates"
  | "monitor"
  | "monthly_profit"
  | "push_notifications";

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
      "inbox", "teamchat", "quickreplies", "tags", "broadcasts", "followups",
      "autoresp", "referrals", "logs", "users", "admins", "super", "profile",
      "rules", "updates", "monitor", "monthly_profit", "push_notifications"
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

function getVipBadgeUrl(status: string | null | undefined): string | null {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  if (normalized === "platinum") return "/platium.png";
  if (normalized === "diamond") return "/dimond.png";
  return `/${normalized}.png`;
}

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
  wallet: number;
  isSpam: boolean;
  isGroup?: boolean;
  vip_status?: string | null;
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

  async function handleNavigateToUserChat(targetUserId: string) {
    try {
      const { data: convRow } = await supabase
        .from("page_conversations")
        .select("id")
        .eq("user_id", targetUserId)
        .maybeSingle();
        
      if (convRow) {
        navigate({
          search: (prev: any) => ({
            ...prev,
            tab: undefined,
            c: convRow.id,
            profile: undefined,
          }),
        });
        return;
      }
      
      const { data: newConv } = await supabase
        .from("page_conversations")
        .insert({ user_id: targetUserId })
        .select("id")
        .single();
        
      if (newConv) {
        navigate({
          search: (prev: any) => ({
            ...prev,
            tab: undefined,
            c: newConv.id,
            profile: undefined,
          }),
        });
      }
    } catch (err) {
      console.error("Failed to navigate to user chat:", err);
    }
  }
  const [confirmOut, setConfirmOut] = useState(false);

  useNativePush();

  useEffect(() => {
    if (user) {
      try {
        localStorage.setItem("jj_me_id", user.id);
      } catch { }
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app/chat", replace: true });
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    if (isSuperAdmin) {
      import("@/lib/admin-super.functions").then(({ runDatabaseMigration }) => {
        runDatabaseMigration().then((r: any) => {
          if (r && !r.success) {
            console.warn("[Migration AutoRun Warning]:", r.error);
          } else {
            console.log("[Migration AutoRun Result]:", r);
          }
        }).catch((e) => {
          console.error("[Migration AutoRun Error]:", e.message || e);
        });
      });
    }
  }, [isSuperAdmin]);

  async function signOut() {
    console.log("[SignOut] Initiated.");
    if (typeof window !== "undefined") {
      console.log("[SignOut] Clearing local storage keys and cookies.");
      localStorage.removeItem("profile_complete");
      localStorage.removeItem("jj_temp_auth_verification");
      setVerifiedStatus(false);
    }
    
    // Update database presence in the background so it never hangs sign out
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[SignOut] Active user ID:", session?.user?.id);
      if (session?.user?.id) {
        supabase
          .from("profiles")
          .update({ online: false, last_seen: new Date().toISOString() })
          .eq("id", session.user.id)
          .then(() => console.log("[SignOut] User presence set to offline."))
          .catch((e) => console.error("Failed to update presence:", e));
      }
    }).catch(() => {});

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

    try {
      console.log("[SignOut] Calling Supabase auth.signOut().");
      await supabase.auth.signOut();
      console.log("[SignOut] Supabase auth.signOut() completed.");
    } catch (e) {
      console.error("Supabase signOut failed:", e);
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    const hostname = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
    const isProdDomain = hostname.endsWith("playjackpotjungle.com");
    console.log("[SignOut] Hostname:", hostname, "isProdDomain:", isProdDomain);
    if (isProdDomain && !Capacitor.isNativePlatform()) {
      console.log("[SignOut] Redirecting window location to chat domain auth.");
      window.location.href = "https://chat.playjackpotjungle.com/app/auth?logout=true";
    } else {
      console.log("[SignOut] Navigating local router to auth.");
      navigate({ to: "/app/auth", search: { logout: "true" }, replace: true });
    }
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
        <SideBtn active={tab === "teamchat"} onClick={() => selectTab("teamchat")} icon={MessageSquare} label="Admin Team Chat" />
        <SideBtn active={tab === "quickreplies"} onClick={() => selectTab("quickreplies")} icon={MessageSquareQuote} label="Quick Replies" />
        <SideBtn active={tab === "tags"} onClick={() => selectTab("tags")} icon={TagIcon} label="Tags" />
        <SideBtn active={tab === "broadcasts"} onClick={() => selectTab("broadcasts")} icon={Megaphone} label="Broadcasts" />
        <SideBtn active={tab === "followups"} onClick={() => selectTab("followups")} icon={Bell} label="Follow-ups" />
        <SideBtn active={tab === "autoresp"} onClick={() => selectTab("autoresp")} icon={Bot} label="Auto-response" />
        <SideBtn active={tab === "referrals"} onClick={() => selectTab("referrals")} icon={Gift} label="Referrals" />
        <SideBtn active={tab === "logs"} onClick={() => selectTab("logs")} icon={Activity} label="Logs" />
        <SideBtn active={tab === "users"} onClick={() => selectTab("users")} icon={UsersIcon} label="Users Management" />
        <SideBtn active={tab === "monthly_profit"} onClick={() => selectTab("monthly_profit")} icon={Coins} label="Monthly Profit" />
        <SideBtn active={tab === "monitor"} onClick={() => selectTab("monitor")} icon={Eye} label="Monitor Chats" />
        <SideBtn active={tab === "push_notifications"} onClick={() => selectTab("push_notifications")} icon={Bell} label="Push Notification" />
        {isSuperAdmin && (
          <>
            <p className="px-3 pt-4 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Pinned Chats</p>
            <SideBtn active={tab === "rules"} onClick={() => selectTab("rules")} icon={BookOpen} label="Rules" />
            <SideBtn active={tab === "updates"} onClick={() => selectTab("updates")} icon={Megaphone} label="Updates" />
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
    <div className="flex h-full flex-1 bg-background text-foreground overflow-hidden">
      {/* Side nav drawer for both desktop and mobile */}
      {navOpen && (
        <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
          <div className="relative z-10 animate-in slide-in-from-left duration-200">{SideNav}</div>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "inbox" ? "" : "hidden"}`}>
          <InboxView meId={user.id} onOpenNav={() => setNavOpen(true)} onUserClick={handleNavigateToUserChat} />
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "teamchat" ? "" : "hidden"}`}>
          <TeamChatView meId={user.id} onOpenNav={() => setNavOpen(true)} onUserClick={handleNavigateToUserChat} />
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "quickreplies" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Quick Replies"><QuickRepliesView meId={user.id} /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "tags" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Tags"><TagsView /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "broadcasts" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Broadcasts"><BroadcastsView /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "followups" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Follow-ups"><FollowupsView meId={user.id} /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "autoresp" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Auto-response"><AutoResponsesView meId={user.id} /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "referrals" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Referrals"><ReferralsAdminView onUserClick={handleNavigateToUserChat} /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "logs" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Logs"><LogsView /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "users" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Users Management">
            <UsersManagementView meId={user.id} />
          </ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "monthly_profit" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Monthly Profit">
            <MonthlyProfitView />
          </ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "monitor" ? "" : "hidden"}`}>
          <MonitorChatsView meId={user.id} onOpenNav={() => setNavOpen(true)} />
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "push_notifications" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Push Notification">
            <PushNotificationsAdminView />
          </ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "rules" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Rules"><SystemAnnouncementsAdminView channelType="rules" meId={user.id} /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "updates" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Updates"><SystemAnnouncementsAdminView channelType="updates" meId={user.id} /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "admins" ? "" : "hidden"}`}>
          <AdminsView onOpenNav={() => setNavOpen(true)} />
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "super" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="Super admin"><SuperAdminView /></ScrollWrap>
        </div>
        <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${tab === "profile" ? "" : "hidden"}`}>
          <ScrollWrap onOpenNav={() => setNavOpen(true)} title="My profile"><AdminProfileView userId={user.id} email={user.email ?? null} /></ScrollWrap>
        </div>
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
      className={`w-full h-10 rounded-lg flex items-center gap-3 px-3 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
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

function InboxView({ meId, onOpenNav, onUserClick }: { meId: string; onOpenNav: () => void; onUserClick?: (userId: string) => void }) {
  const navigate = useNavigate();
  const [convs, setConvs] = useState<ConvRow[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("jj_cached_admin_conversations");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [search, setSearch] = useState("");
  const searchParams = Route.useSearch();

  // Sync user wallet balance updates across components in real-time
  useEffect(() => {
    const handleWalletUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { userId, wallet_balance, credit_balance } = customEvent.detail || {};
      if (userId) {
        setConvs((prev) =>
          prev.map((c) =>
            c.userId === userId
              ? { ...c, wallet: wallet_balance, credit: credit_balance }
              : c
          )
        );
      }
    };
    window.addEventListener("wallet-updated", handleWalletUpdate);
    return () => {
      window.removeEventListener("wallet-updated", handleWalletUpdate);
    };
  }, []);

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

  const [viewGroups, setViewGroups] = useState(false);
  const [groupRows, setGroupRows] = useState<ConvRow[]>([]);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [preselectedFriendId, setPreselectedFriendId] = useState<string | undefined>(undefined);

  const handleOpenCreateGroupForUser = (userId: string) => {
    setPreselectedFriendId(userId);
    setCreateGroupOpen(true);
  };
  const [activeGroup, setActiveGroup] = useState<any>(null);
  const [activeGroupMembers, setActiveGroupMembers] = useState<any[]>([]);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [messages, setMessages] = useState<any[]>([]);
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null);

  const [shareProfileOpen, setShareProfileOpen] = useState(false);
  const [shareProfileTarget, setShareProfileTarget] = useState<{ username: string; displayName: string; avatarUrl: string | null; memberSince?: string } | null>(null);

  const handleShareProfile = async (userId: string, username: string, avatarUrl: string | null) => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("first_name, last_name, created_at")
      .eq("id", userId)
      .maybeSingle();

    const displayName = prof?.first_name
      ? (prof.last_name ? `${prof.first_name} ${prof.last_name}` : prof.first_name)
      : username;

    setShareProfileTarget({
      username,
      displayName,
      avatarUrl,
      memberSince: prof?.created_at
    });
    setShareProfileOpen(true);
  };

  const [myUsername, setMyUsername] = useState("Admin");
  const [isDesktop, setIsDesktop] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!meId) return;
    supabase.from("profiles").select("username").eq("id", meId).single().then(({ data }) => {
      if (data?.username) setMyUsername(data.username);
    });
  }, [meId]);

  useEffect(() => {
    setMessages([]);
    setSelectedMemberProfile(null);
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !activeId.startsWith("group-")) {
      setActiveGroup(null);
      setActiveGroupMembers([]);
      return;
    }
    const groupId = activeId.replace("group-", "");
    async function loadGroupDetails() {
      const [{ data: g }, { data: m }] = await Promise.all([
        supabase.from("groups").select("*").eq("id", groupId).maybeSingle(),
        supabase.from("group_members").select("*, profiles:user_id(id, username, first_name, last_name, avatar_url)").eq("group_id", groupId)
      ]);
      if (!g) {
        setActiveId(null);
        toast.error("This group has been dismissed.");
        return;
      }
      setActiveGroup(g);
      if (m) setActiveGroupMembers(m);
    }
    loadGroupDetails();
  }, [activeId]);

  async function handleLeaveGroup() {
    if (!meId || !activeGroup) return;

    try {
      const groupId = activeGroup.id;
      // 1. Fetch current members of the group to ensure the latest status from DB
      const { data: membersRes } = await supabase
        .from("group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", groupId);

      const membersList = membersRes ?? [];
      const remaining = membersList.filter(m => m.user_id !== meId);

      // 2. If no remaining members, dismiss the group entirely!
      if (remaining.length === 0) {
        await supabase.from("group_members").delete().eq("group_id", groupId);
        await supabase.from("messages").delete().eq("group_id", groupId);
        await supabase.from("groups").delete().eq("id", groupId);

        toast.success("You left. Group has been dismissed.");
        setActiveId(null);
        load();
        return;
      }

      // 3. Check if the leaving user is the group administrator
      const leavingMember = membersList.find(m => m.user_id === meId);
      const wasAdmin = leavingMember?.role === "admin";

      if (wasAdmin) {
        // If there's no other group administrator left among the remaining members
        const hasOtherAdmin = remaining.some(m => m.role === "admin");
        if (!hasOtherAdmin) {
          // Priority 1: Find earliest joined app-level administrator/super administrator
          const remainingUserIds = remaining.map(m => m.user_id);
          const { data: appRoles } = await supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", remainingUserIds);

          const eligibleAdminIds = new Set(
            (appRoles ?? [])
              .filter(r => r.role === "admin" || r.role === "super_admin")
              .map(r => r.user_id)
          );

          const sortedRemaining = [...remaining].sort((a, b) =>
            new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
          );

          const eligibleAdmins = sortedRemaining.filter(m => eligibleAdminIds.has(m.user_id));

          let newAdminId = "";
          if (eligibleAdmins.length > 0) {
            newAdminId = eligibleAdmins[0].user_id;
          } else {
            // Priority 2: Automatically promote the earliest remaining group member
            newAdminId = sortedRemaining[0].user_id;
          }

          if (newAdminId) {
            // Update role to admin
            await supabase
              .from("group_members")
              .update({ role: "admin" } as any)
              .eq("group_id", groupId)
              .eq("user_id", newAdminId);

            // Get profile's display name
            const { data: profile } = await supabase
              .from("profiles")
              .select("username, first_name, last_name")
              .eq("id", newAdminId)
              .single();

            const targetDisplayName = profile
              ? (profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username)
              : "Someone";

            // Insert ownership transferred message
            await supabase.from("messages").insert({
              group_id: groupId,
              sender_id: meId,
              content: `[system:ownership_transferred:${targetDisplayName}]`
            } as any);
          }
        }
      }

      // 4. Create the system user_left message BEFORE deleting the membership
      await supabase.from("messages").insert({
        sender_id: meId,
        group_id: groupId,
        content: `[system:user_left:Jackpot Jungle]`
      } as any);

      // 5. Delete leaving member's entry
      const { error: deleteErr } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", meId);

      if (deleteErr) throw deleteErr;

      toast.success("You left the group");
      setActiveId(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to leave group");
    }
  }

  async function handleUpdateGroupName(newName: string) {
    if (!activeGroup || !meId) return;
    const { error } = await supabase.from("groups").update({ name: newName }).eq("id", activeGroup.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("messages").insert({
      group_id: activeGroup.id,
      sender_id: meId,
      content: `[system:group_name_changed:${newName}:${myUsername}]`
    } as any);
    setActiveGroup(prev => prev ? { ...prev, name: newName } : null);
    setGroupRows(prev => prev.map(c => c.conversationId === `group-${activeGroup.id}` ? { ...c, username: newName } : c));
  }

  async function handleUpdateGroupAvatar(newUrl: string) {
    if (!activeGroup || !meId) return;
    const { error } = await supabase.from("groups").update({ avatar_url: newUrl }).eq("id", activeGroup.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("messages").insert({
      group_id: activeGroup.id,
      sender_id: meId,
      content: `[system:group_avatar_changed:${myUsername}]`
    } as any);
    setActiveGroup(prev => prev ? { ...prev, avatar_url: newUrl } : null);
    setGroupRows(prev => prev.map(c => c.conversationId === `group-${activeGroup.id}` ? { ...c, avatar_url: newUrl } : c));
  }

  async function handleRemoveMember(userId: string, username: string) {
    if (!activeGroup || !meId) return;
    const { error } = await supabase.from("group_members").delete().eq("group_id", activeGroup.id).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("messages").insert({
      group_id: activeGroup.id,
      sender_id: meId,
      content: `[system:user_removed:${username}:${myUsername}]`
    } as any);
    setActiveGroupMembers(prev => prev.filter(m => m.user_id !== userId));
  }

  async function handlePromoteMember(userId: string, username: string) {
    if (!activeGroup || !meId) return;
    const { error } = await supabase.from("group_members").update({ role: "admin" } as any).eq("group_id", activeGroup.id).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("messages").insert({
      group_id: activeGroup.id,
      sender_id: meId,
      content: `[system:user_promoted:${username}:${myUsername}]`
    } as any);
    setActiveGroupMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: "admin" } : m));
  }

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
    try {
      const { data: convList } = await supabase
        .from("page_conversations")
        .select("id, user_id, last_message_at, is_spam")
        .order("last_message_at", { ascending: false })
        .limit(200);

      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id, role, groups(id, name, avatar_url, created_at, created_by)")
        .eq("user_id", meId);

      const userIds = convList ? convList.map((c) => c.user_id) : [];
      const convIds = convList ? convList.map((c) => c.id) : [];

      const queries: Promise<any>[] = [
        userIds.length > 0 ? supabase.from("profiles").select("id, username, avatar_url, online, last_seen, wallet_balance, credit_balance, vip_status").in("id", userIds) : Promise.resolve({ data: [] }),
        convIds.length > 0 ? supabase.from("page_messages").select("conversation_id, content, created_at, seen, from_page, image_url, audio_url").in("conversation_id", convIds).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
        supabase.from("tags").select("id, name, color").order("name"),
        userIds.length > 0 ? supabase.from("user_tags").select("user_id, tag_id").in("user_id", userIds) : Promise.resolve({ data: [] }),
        userIds.length > 0 ? supabase.from("user_credits").select("user_id, balance").in("user_id", userIds) : Promise.resolve({ data: [] }),
        supabase.from("calls").select("id, caller_id, callee_id, call_type, status, created_at").in("context", ["page", "page_broadcast"]).order("created_at", { ascending: false }).limit(300),
        userIds.length > 0 ? supabase.from("user_roles").select("user_id, role").in("user_id", userIds) : Promise.resolve({ data: [] })
      ];

      const groupIds = (memberships ?? []).map((m: any) => m.group_id).filter(Boolean);
      if (groupIds.length > 0) {
        queries.push(
          supabase
            .from("messages")
            .select("group_id, content, created_at, sender_id, seen, image_url, audio_url")
            .in("group_id", groupIds)
            .order("created_at", { ascending: false })
            .limit(500)
        );
      } else {
        queries.push(Promise.resolve({ data: [] }));
      }

      const [profiles, msgs, tagsData, utRows, credRows, supportCalls, userRolesRes, groupMsgsRes] = await Promise.all(queries);

      setAllTags(tagsData?.data ?? tagsData ?? []);
      const map: Record<string, string[]> = {};
      (utRows?.data ?? utRows ?? []).forEach((r: any) => {
        (map[r.user_id] = map[r.user_id] || []).push(r.tag_id);
      });
      setUserTagMap(map);

      const adminUsers = new Set<string>();
      (userRolesRes?.data ?? userRolesRes ?? []).forEach((r: any) => {
        if (r.role === "admin" || r.role === "super_admin") {
          adminUsers.add(r.user_id);
        }
      });

      const creditMap = new Map<string, number>((credRows?.data ?? credRows ?? []).map((c: any) => [c.user_id, Number(c.balance) || 0]));
      const byUser = new Map((profiles?.data ?? profiles ?? []).map((p: any) => [p.id, p]));
      const rows: ConvRow[] = (convList ?? []).map((c) => {
        const p = byUser.get(c.user_id);
        const convMsgs = (msgs?.data ?? msgs ?? []).filter((m: any) => m.conversation_id === c.id);
        const lastMsg = convMsgs[0];
        const unread = convMsgs.filter((m: any) => !m.from_page && !m.seen).length;

        // Find most recent call associated with this user
        const userCalls = (supportCalls?.data ?? supportCalls ?? []).filter((call: any) => call.caller_id === c.user_id || call.callee_id === c.user_id);
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

        if (lastMessage && isSystemMessage(lastMessage)) {
          lastMessage = formatSystemMessage(lastMessage);
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
          credit: p?.credit_balance ?? creditMap.get(c.user_id) ?? 0,
          wallet: p?.wallet_balance ?? 0,
          isSpam: (c as any).is_spam ?? false,
          isAdmin: adminUsers.has(c.user_id),
          vip_status: p?.vip_status ?? null,
        };
      });

      // Sort conversations strictly by most recent activity
      rows.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
      setConvs(rows);

      // Parse groups
      const groupMessages = groupMsgsRes?.data ?? groupMsgsRes ?? [];
      const gRows: ConvRow[] = (memberships ?? []).map((m: any) => {
        const g = m.groups;
        if (!g) return null;
        const gMsgs = (groupMessages ?? []).filter((msg: any) => msg.group_id === g.id);
        const lastMsg = gMsgs[0];
        const unread = gMsgs.filter((msg: any) => msg.sender_id !== meId && !msg.seen).length;

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

        if (lastMessage && isSystemMessage(lastMessage)) {
          lastMessage = formatSystemMessage(lastMessage);
        }

        return {
          conversationId: `group-${g.id}`,
          userId: g.created_by,
          username: g.name,
          avatar_url: g.avatar_url,
          online: false,
          last_seen: g.created_at,
          lastMessage: lastMessage ?? "Group created",
          lastAt: lastMsg?.created_at ?? g.created_at,
          unread,
          credit: 0,
          isSpam: false,
          isGroup: true,
        };
      }).filter(Boolean) as ConvRow[];

      gRows.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
      setGroupRows(gRows);

      try {
        localStorage.setItem("jj_cached_admin_conversations", JSON.stringify(rows));
      } catch { }
    } finally {
      setLoadingConvs(false);
    }
  }

  useEffect(() => {
    if (convs.length > 0) {
      try {
        localStorage.setItem("jj_cached_admin_conversations", JSON.stringify(convs));
      } catch {}
    }
  }, [convs]);

  useEffect(() => {
    load();
    let mounted = true;
    const rand = Math.random().toString(36).slice(2, 9);
    const ch = supabase
      .channel(`admin-page-inbox-${rand}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "page_messages" }, (payload) => {
        if (!mounted) return;
        const m = payload.new as any;
        if (!m) return;
        if (payload.eventType === "INSERT") {
          setConvs((prev) => {
            const idx = prev.findIndex((c) => c.conversationId === m.conversation_id);
            if (idx === -1) {
              load();
              return prev;
            }
            let preview = m.content;
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
            } else if (!preview) {
              preview = m.image_url ? "📷 Photo" : m.audio_url ? "🎤 Voice message" : "Message";
            }

            if (preview && isSystemMessage(preview)) {
              preview = formatSystemMessage(preview);
            }

            const copy = [...prev];
            const updated = { ...copy[idx] };
            updated.lastMessage = preview;
            updated.lastAt = m.created_at;
            if (!m.from_page && !m.seen) {
              updated.unread += 1;
            }
            copy[idx] = updated;
            return copy.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
          });
        } else if (payload.eventType === "UPDATE") {
          if (!m.from_page && m.seen) {
            setConvs((prev) =>
              prev.map((c) => (c.conversationId === m.conversation_id ? { ...c, unread: 0 } : c))
            );
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "page_conversations" }, () => {
        if (mounted) load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_tags" }, () => {
        if (mounted) load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tags" }, () => {
        if (mounted) load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_credits" }, () => {
        if (mounted) load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => {
        if (mounted) load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        if (mounted) load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => {
        if (mounted) load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        if (mounted) load();
      })
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  // Optimistically clear unread badges for the active conversation
  useEffect(() => {
    if (activeId) {
      setConvs((prev) =>
        prev.map((c) => (c.conversationId === activeId ? { ...c, unread: 0 } : c))
      );
      setGroupRows((prev) =>
        prev.map((c) => (c.conversationId === activeId ? { ...c, unread: 0 } : c))
      );
    }
  }, [activeId]);

  const filtered = viewGroups
    ? groupRows.filter((u) => !search || u.username.toLowerCase().includes(search.toLowerCase()))
    : (() => {
      const showBoth = !viewSpam && tagFilter === null;
      const baseConvs = showBoth ? [...convs, ...groupRows] : convs;
      return baseConvs.filter((u) => {
        if (u.isGroup) {
          if (search && !u.username.toLowerCase().includes(search.toLowerCase())) return false;
          return true;
        }
        if (viewSpam ? !u.isSpam : u.isSpam) return false;
        if (search && !u.username.toLowerCase().includes(search.toLowerCase())) return false;
        if (tagFilter && !(userTagMap[u.userId] ?? []).includes(tagFilter)) return false;
        return true;
      });
    })();

  const sorted = [...filtered].sort((a, b) => {
    const aPinned = pinnedConvs.includes(a.conversationId);
    const bPinned = pinnedConvs.includes(b.conversationId);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
  });
  const spamCount = convs.filter((u) => u.isSpam).length;
  const active = (convs.find((u) => u.conversationId === activeId) || groupRows.find((u) => u.conversationId === activeId)) ?? null;

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
              onClick={() => { setViewSpam(false); setViewGroups(false); setTagFilter(null); }}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border ${!viewSpam && !viewGroups && tagFilter === null ? "bg-primary text-primary-foreground border-transparent" : "bg-secondary border-transparent text-muted-foreground"}`}
            >
              All
            </button>
            <button
              onClick={() => { setViewSpam(false); setViewGroups(true); setTagFilter(null); }}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border inline-flex items-center gap-1 ${!viewSpam && viewGroups ? "bg-primary text-primary-foreground border-transparent" : "bg-secondary border-transparent text-muted-foreground"}`}
            >
              Groups
            </button>
            {!viewGroups && allTags.map((t) => {
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
            {!viewGroups && (
              <button
                onClick={() => { setViewSpam(true); setTagFilter(null); }}
                className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border inline-flex items-center gap-1 ${viewSpam ? "bg-destructive text-destructive-foreground border-transparent" : "bg-secondary border-transparent text-muted-foreground"}`}
              >
                <Ban className="h-3 w-3" /> Spam{spamCount > 0 ? ` (${spamCount})` : ""}
              </button>
            )}
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
        </div>
        <PullToRefresh onRefresh={load}>
          {viewGroups && (
            <button
              onClick={() => setCreateGroupOpen(true)}
              className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-2xl text-left bg-primary/10 hover:bg-primary/15 text-primary border border-primary/15 transition-all font-semibold w-[calc(100%-1rem)]"
            >
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                <Plus className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight">Create Group Chat</p>
                <p className="text-[10px] text-muted-foreground/90 truncate leading-snug">Start a group chat with players</p>
              </div>
            </button>
          )}
          {loadingConvs && (viewGroups ? groupRows.length === 0 : convs.length === 0) ? (
            <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Loading chats…</span>
            </div>
          ) : sorted.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{viewGroups ? "No groups yet." : viewSpam ? "No spam conversations." : "No conversations."}</p>
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
                        {u.vip_status && u.vip_status !== "none" && (
                          <img 
                            src={getVipBadgeUrl(u.vip_status) || undefined} 
                            alt={`${u.vip_status} VIP`} 
                            className="h-4 w-auto object-contain select-none shrink-0"
                            title={`${u.vip_status.toUpperCase()} VIP`}
                          />
                        )}
                        {u.isAdmin && (
                          <Shield className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10 shrink-0" title="Admin User" />
                        )}
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
                      {!u.isGroup && (userTagMap[u.userId] ?? []).slice(0, 3).map((tid) => {
                        const t = allTags.find((x) => x.id === tid);
                        if (!t) return null;
                        return <span key={tid} className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-semibold" style={{ background: t.color }}>{t.name}</span>;
                      })}
                    </div>
                  </div>
                  {!!u.unread && <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-[10px] text-primary-foreground font-bold flex items-center justify-center shrink-0">{u.unread}</span>}
                </button>
                {!u.isGroup && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConvSpam(u, !u.isSpam); }}
                    title={u.isSpam ? "Remove from spam" : "Move to spam"}
                    aria-label={u.isSpam ? "Remove from spam" : "Move to spam"}
                    className={`absolute right-4 top-3 h-7 w-7 rounded-full bg-background border border-border items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-opacity flex ${u.isSpam ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
                  >
                    {u.isSpam ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                  </button>
                )}
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
            messages={messages}
            setMessages={setMessages}
            onUserClick={onUserClick}
            onBack={() => setActiveId(null)}
            onOpenDetail={() => setDetailOpen(true)}
            onToggleSpam={() => setConvSpam(active, !active.isSpam)}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            activeMatch={activeMatch}
            setActiveMatch={setActiveMatch}
            onLastMessageUpdate={(content, image_url, audio_url, created_at) => {
              const updater = (prev: ConvRow[]) => {
                const idx = prev.findIndex((c) => c.conversationId === active.conversationId);
                if (idx === -1) return prev;
                let preview = content;
                if (!preview) {
                  preview = image_url ? "📷 Photo" : audio_url ? "🎤 Voice message" : "Message";
                }
                if (preview && isSystemMessage(preview)) {
                  preview = formatSystemMessage(preview);
                }
                const copy = [...prev];
                const updated = { ...copy[idx] };
                updated.lastMessage = preview;
                updated.lastAt = created_at;
                copy[idx] = updated;
                return copy.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
              };
              if (active.isGroup || active.conversationId.startsWith("group-")) {
                setGroupRows(updater);
              } else {
                setConvs(updater);
              }
            }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 text-muted-foreground">
            <Inbox className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Select a conversation to reply as the page.</p>
          </div>
        )}
      </div>

      {detailOpen && active && (
        <aside className="w-80 border-l border-border bg-card hidden lg:flex flex-col overflow-y-auto shrink-0 animate-in slide-in-from-right duration-200">
          {selectedMemberProfile ? (
            <UserDetailPanel
              userId={selectedMemberProfile.id}
              username={selectedMemberProfile.username}
              avatar={selectedMemberProfile.avatar_url}
              variant="embedded"
              onClose={() => setSelectedMemberProfile(null)}
              onCreateGroupClick={() => handleOpenCreateGroupForUser(selectedMemberProfile.id)}
              onSearchClick={() => {
                setDetailOpen(false);
                setSearchOpen(true);
                setSearchQuery("");
                setActiveMatch(0);
              }}
              onShareClick={() => handleShareProfile(selectedMemberProfile.id, selectedMemberProfile.username, selectedMemberProfile.avatar_url)}
              onWalletClick={() => {
                loadWalletDetails(selectedMemberProfile.id);
                setWalletPopupOpen(true);
              }}
              onHistoryClick={() => {
                loadWalletHistory("all", selectedMemberProfile.id);
                setWalletHistoryPopupOpen(true);
              }}
              onUserClick={onUserClick}
            />
          ) : active.isGroup ? (
            <GroupDetailPanel
              group={activeGroup}
              members={activeGroupMembers}
              messages={messages}
              meId={meId}
              onClose={() => setDetailOpen(false)}
              onLeave={handleLeaveGroup}
              onUpdateName={handleUpdateGroupName}
              onUpdateAvatar={handleUpdateGroupAvatar}
              onAddMembers={() => setAddMembersOpen(true)}
              onShare={() => setShareOpen(true)}
              onRemoveMember={handleRemoveMember}
              onPromoteMember={handlePromoteMember}
              onMemberClick={(userId, username, avatarUrl) => {
                setSelectedMemberProfile({ id: userId, username, avatar_url: avatarUrl });
              }}
            />
          ) : (
            <UserDetailPanel
              userId={active.userId}
              username={active.username}
              avatar={active.avatar_url}
              variant="embedded"
              onClose={() => setDetailOpen(false)}
              onCreateGroupClick={() => handleOpenCreateGroupForUser(active.userId)}
              onSearchClick={() => {
                setDetailOpen(false);
                setSearchOpen(true);
                setSearchQuery("");
                setActiveMatch(0);
              }}
              onShareClick={() => handleShareProfile(active.userId, active.username, active.avatar_url)}
              onWalletClick={() => {
                loadWalletDetails(active.userId);
                setWalletPopupOpen(true);
              }}
              onHistoryClick={() => {
                loadWalletHistory("all", active.userId);
                setWalletHistoryPopupOpen(true);
              }}
              onUserClick={onUserClick}
            />
          )}
        </aside>
      )}

      {/* Mobile/tablet: detail sheet (panel is hidden lg:flex by default) */}
      <Sheet open={detailOpen && !!active && !isDesktop} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-none p-0 lg:hidden flex flex-col h-full bg-card [&>button]:hidden">
          {active && (
            selectedMemberProfile ? (
              <UserDetailPanel
                userId={selectedMemberProfile.id}
                username={selectedMemberProfile.username}
                avatar={selectedMemberProfile.avatar_url}
                variant="embedded"
                onClose={() => setSelectedMemberProfile(null)}
                onCreateGroupClick={() => handleOpenCreateGroupForUser(selectedMemberProfile.id)}
                onSearchClick={() => {
                  setDetailOpen(false);
                  setSearchOpen(true);
                  setSearchQuery("");
                  setActiveMatch(0);
                }}
                onShareClick={() => handleShareProfile(selectedMemberProfile.id, selectedMemberProfile.username, selectedMemberProfile.avatar_url)}
                onWalletClick={() => {
                  loadWalletDetails(selectedMemberProfile.id);
                  setWalletPopupOpen(true);
                }}
                onHistoryClick={() => {
                  loadWalletHistory("all", selectedMemberProfile.id);
                  setWalletHistoryPopupOpen(true);
                }}
                onUserClick={onUserClick}
              />
            ) : active.isGroup ? (
              <div className="flex-1 overflow-y-auto min-h-0">
                <GroupDetailPanel
                  group={activeGroup}
                  members={activeGroupMembers}
                  messages={messages}
                  meId={meId}
                  onClose={() => setDetailOpen(false)}
                  onLeave={handleLeaveGroup}
                  onUpdateName={handleUpdateGroupName}
                  onUpdateAvatar={handleUpdateGroupAvatar}
                  onAddMembers={() => setAddMembersOpen(true)}
                  onShare={() => setShareOpen(true)}
                  onRemoveMember={handleRemoveMember}
                  onPromoteMember={handlePromoteMember}
                  onMemberClick={(userId, username, avatarUrl) => {
                    setSelectedMemberProfile({ id: userId, username, avatar_url: avatarUrl });
                  }}
                />
              </div>
            ) : (
              <UserDetailPanel
                userId={active.userId}
                username={active.username}
                avatar={active.avatar_url}
                variant="embedded"
                onClose={() => setDetailOpen(false)}
                onCreateGroupClick={() => handleOpenCreateGroupForUser(active.userId)}
                onSearchClick={() => {
                  setDetailOpen(false);
                  setSearchOpen(true);
                  setSearchQuery("");
                  setActiveMatch(0);
                }}
                onShareClick={() => handleShareProfile(active.userId, active.username, active.avatar_url)}
                onWalletClick={() => {
                  loadWalletDetails(active.userId);
                  setWalletPopupOpen(true);
                }}
                onHistoryClick={() => {
                  loadWalletHistory("all", active.userId);
                  setWalletHistoryPopupOpen(true);
                }}
                onUserClick={onUserClick}
              />
            )
          )}
        </SheetContent>
      </Sheet>

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => {
          setCreateGroupOpen(false);
          setPreselectedFriendId(undefined);
        }}
        meId={meId}
        isAdminOrSuper={true}
        preselectedMemberId={preselectedFriendId}
        onGroupCreated={(groupId) => {
          load();
          setActiveId(`group-${groupId}`);
        }}
      />

      {/* Group Add Members Modal */}
      {addMembersOpen && activeGroup && (
        <GroupAddMembersModal
          open={addMembersOpen}
          onClose={() => setAddMembersOpen(false)}
          groupId={activeGroup.id}
          meId={meId}
          isAdminOrSuper={true}
          onMembersAdded={() => {
            // reload group members
            supabase.from("group_members").select("*, profiles:user_id(id, username, first_name, last_name, avatar_url)").eq("group_id", activeGroup.id).then(({ data }) => {
              if (data) setActiveGroupMembers(data);
            });
            load();
          }}
        />
      )}

      {/* Group Share Modal */}
      {shareOpen && activeGroup && (
        <GroupShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          groupId={activeGroup.id}
          groupName={activeGroup.name || "Group"}
          meId={meId}
        />
      )}

      {contextMenuTarget && (() => {
        const targetConv = convs.find(c => c.conversationId === contextMenuTarget) || groupRows.find(c => c.conversationId === contextMenuTarget);
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
                {!targetConv.isGroup && (
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
                )}
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
      {shareProfileOpen && shareProfileTarget && (
        <ShareProfileModal
          isOpen={shareProfileOpen}
          onOpenChange={setShareProfileOpen}
          username={shareProfileTarget.username}
          displayName={shareProfileTarget.displayName}
          avatarUrl={shareProfileTarget.avatarUrl}
          memberSince={shareProfileTarget.memberSince}
        />
      )}
    </div>
  );
}

function TeamChatView({ meId, onOpenNav, onUserClick }: { meId: string; onOpenNav: () => void; onUserClick?: (userId: string) => void }) {
  const navigate = useNavigate();
  const [convs, setConvs] = useState<ConvRow[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("jj_cached_team_conversations");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [loadingConvs, setLoadingConvs] = useState(true);
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

  const [viewGroups, setViewGroups] = useState(false);
  const [groupRows, setGroupRows] = useState<ConvRow[]>([]);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [preselectedFriendId, setPreselectedFriendId] = useState<string | undefined>(undefined);

  const handleOpenCreateGroupForUser = (userId: string) => {
    setPreselectedFriendId(userId);
    setCreateGroupOpen(true);
  };
  const [activeGroup, setActiveGroup] = useState<any>(null);
  const [activeGroupMembers, setActiveGroupMembers] = useState<any[]>([]);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [messages, setMessages] = useState<any[]>([]);
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null);

  const [shareProfileOpen, setShareProfileOpen] = useState(false);
  const [shareProfileTarget, setShareProfileTarget] = useState<{ username: string; displayName: string; avatarUrl: string | null; memberSince?: string } | null>(null);

  const handleShareProfile = async (userId: string, username: string, avatarUrl: string | null) => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("first_name, last_name, created_at")
      .eq("id", userId)
      .maybeSingle();

    const displayName = prof?.first_name
      ? (prof.last_name ? `${prof.first_name} ${prof.last_name}` : prof.first_name)
      : username;

    setShareProfileTarget({
      username,
      displayName,
      avatarUrl,
      memberSince: prof?.created_at
    });
    setShareProfileOpen(true);
  };

  const [myUsername, setMyUsername] = useState("Admin");
  const [isDesktop, setIsDesktop] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!meId) return;
    supabase.from("profiles").select("username").eq("id", meId).single().then(({ data }) => {
      if (data?.username) setMyUsername(data.username);
    });
  }, [meId]);

  useEffect(() => {
    setMessages([]);
    setSelectedMemberProfile(null);
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !activeId.startsWith("group-")) {
      setActiveGroup(null);
      setActiveGroupMembers([]);
      return;
    }
    const groupId = activeId.replace("group-", "");
    async function loadGroupDetails() {
      const [{ data: g }, { data: m }] = await Promise.all([
        supabase.from("groups").select("*").eq("id", groupId).maybeSingle(),
        supabase.from("group_members").select("*, profiles:user_id(id, username, first_name, last_name, avatar_url)").eq("group_id", groupId)
      ]);
      if (!g) {
        setActiveId(null);
        toast.error("This group has been dismissed.");
        return;
      }
      setActiveGroup(g);
      if (m) setActiveGroupMembers(m);
    }
    loadGroupDetails();
  }, [activeId]);

  async function handleLeaveGroup() {
    if (!meId || !activeGroup) return;

    try {
      const groupId = activeGroup.id;
      const { data: membersRes } = await supabase
        .from("group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", groupId);

      const membersList = membersRes ?? [];
      const remaining = membersList.filter(m => m.user_id !== meId);

      if (remaining.length === 0) {
        await supabase.from("group_members").delete().eq("group_id", groupId);
        await supabase.from("messages").delete().eq("group_id", groupId);
        await supabase.from("groups").delete().eq("id", groupId);

        toast.success("You left. Group has been dismissed.");
        setActiveId(null);
        load();
        return;
      }

      const leavingMember = membersList.find(m => m.user_id === meId);
      const wasAdmin = leavingMember?.role === "admin";

      if (wasAdmin) {
        const hasOtherAdmin = remaining.some(m => m.role === "admin");
        if (!hasOtherAdmin) {
          const remainingUserIds = remaining.map(m => m.user_id);
          const { data: appRoles } = await supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", remainingUserIds);

          const eligibleAdminIds = new Set(
            (appRoles ?? [])
              .filter(r => r.role === "admin" || r.role === "super_admin")
              .map(r => r.user_id)
          );

          const sortedRemaining = [...remaining].sort((a, b) =>
            new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
          );

          const eligibleAdmins = sortedRemaining.filter(m => eligibleAdminIds.has(m.user_id));

          let newAdminId = "";
          if (eligibleAdmins.length > 0) {
            newAdminId = eligibleAdmins[0].user_id;
          } else {
            newAdminId = sortedRemaining[0].user_id;
          }

          if (newAdminId) {
            await supabase
              .from("group_members")
              .update({ role: "admin" } as any)
              .eq("group_id", groupId)
              .eq("user_id", newAdminId);

            const { data: profile } = await supabase
              .from("profiles")
              .select("username, first_name, last_name")
              .eq("id", newAdminId)
              .single();

            const targetDisplayName = profile
              ? (profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username)
              : "Someone";

            await supabase.from("messages").insert({
              group_id: groupId,
              sender_id: meId,
              content: `[system:ownership_transferred:${targetDisplayName}]`
            } as any);
          }
        }
      }

      await supabase.from("messages").insert({
        sender_id: meId,
        group_id: groupId,
        content: `[system:user_left:Jackpot Jungle]`
      } as any);

      const { error: deleteErr } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", meId);

      if (deleteErr) throw deleteErr;

      toast.success("You left the group");
      setActiveId(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to leave group");
    }
  }

  async function handleUpdateGroupName(newName: string) {
    if (!activeGroup || !meId) return;
    const { error } = await supabase.from("groups").update({ name: newName }).eq("id", activeGroup.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("messages").insert({
      group_id: activeGroup.id,
      sender_id: meId,
      content: `[system:group_name_changed:${newName}:${myUsername}]`
    } as any);
    setActiveGroup(prev => prev ? { ...prev, name: newName } : null);
    setGroupRows(prev => prev.map(c => c.conversationId === `group-${activeGroup.id}` ? { ...c, username: newName } : c));
  }

  async function handleUpdateGroupAvatar(newUrl: string) {
    if (!activeGroup || !meId) return;
    const { error } = await supabase.from("groups").update({ avatar_url: newUrl }).eq("id", activeGroup.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("messages").insert({
      group_id: activeGroup.id,
      sender_id: meId,
      content: `[system:group_avatar_changed:${myUsername}]`
    } as any);
    setActiveGroup(prev => prev ? { ...prev, avatar_url: newUrl } : null);
    setGroupRows(prev => prev.map(c => c.conversationId === `group-${activeGroup.id}` ? { ...c, avatar_url: newUrl } : c));
  }

  async function handleRemoveMember(userId: string, username: string) {
    if (!activeGroup || !meId) return;
    const { error } = await supabase.from("group_members").delete().eq("group_id", activeGroup.id).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("messages").insert({
      group_id: activeGroup.id,
      sender_id: meId,
      content: `[system:user_removed:${username}:${myUsername}]`
    } as any);
    setActiveGroupMembers(prev => prev.filter(m => m.user_id !== userId));
  }

  async function handlePromoteMember(userId: string, username: string) {
    if (!activeGroup || !meId) return;
    const { error } = await supabase.from("group_members").update({ role: "admin" } as any).eq("group_id", activeGroup.id).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("messages").insert({
      group_id: activeGroup.id,
      sender_id: meId,
      content: `[system:user_promoted:${username}:${myUsername}]`
    } as any);
    setActiveGroupMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: "admin" } : m));
  }

  const [pinnedConvs, setPinnedConvs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("jj_pinned_team_convs");
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
    localStorage.setItem("jj_pinned_team_convs", JSON.stringify(next));
  };

  async function load() {
    try {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "super_admin"]);

      const staffRoles = roleRows ?? [];
      const staffUserIds = staffRoles.map(r => r.user_id);

      const adminUsers = new Set(staffRoles.filter(r => r.role === "admin" || r.role === "super_admin").map(r => r.user_id));
      const superAdminUsers = new Set(staffRoles.filter(r => r.role === "super_admin").map(r => r.user_id));

      const { data: profiles } = staffUserIds.length > 0
        ? await supabase
          .from("profiles")
          .select("id, username, avatar_url, online, last_seen")
          .in("id", staffUserIds)
        : { data: [] };

      const { data: dmMsgs } = staffUserIds.length > 0
        ? await supabase
          .from("messages")
          .select("id, sender_id, receiver_id, content, image_url, audio_url, created_at, seen")
          .is("group_id", null)
          .or(`and(sender_id.eq.${meId},receiver_id.in.(${staffUserIds.join(",")})),and(receiver_id.eq.${meId},sender_id.in.(${staffUserIds.join(",")}))`)
          .order("created_at", { ascending: false })
        : { data: [] };

      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id, role, groups(id, name, avatar_url, created_at, created_by, is_admin_team)")
        .eq("user_id", meId);

      const adminGroups = (memberships ?? [])
        .map((m: any) => m.groups)
        .filter((g: any) => g && g.is_admin_team === true);

      const adminGroupIds = adminGroups.map((g: any) => g.id);

      const { data: groupMsgs } = adminGroupIds.length > 0
        ? await supabase
          .from("messages")
          .select("id, sender_id, group_id, content, image_url, audio_url, created_at, seen, sender:sender_id(id, username)")
          .in("group_id", adminGroupIds)
          .order("created_at", { ascending: false })
        : { data: [] };

      const dmRows: ConvRow[] = (profiles ?? [])
        .filter((p: any) => p.id !== meId)
        .map((p: any) => {
          const convMsgs = (dmMsgs ?? []).filter((m: any) =>
            (m.sender_id === meId && m.receiver_id === p.id) ||
            (m.sender_id === p.id && m.receiver_id === meId)
          );
          const lastMsg = convMsgs[0];
          const unread = convMsgs.filter((m: any) => m.sender_id === p.id && !m.seen).length;

          let lastMessage = lastMsg?.content ?? null;
          if (lastMessage?.startsWith("[system:reaction:")) {
            lastMessage = "Reacted to a message";
          } else if (lastMessage?.startsWith("[system:unsent]")) {
            lastMessage = "Unsent a message";
          } else if (lastMessage?.startsWith("[reply:")) {
            const match = lastMessage.match(/^\[reply:[^\]]+\]\s*([\s\S]*)/);
            if (match) lastMessage = match[1];
          } else if (!lastMessage && (lastMsg?.image_url || lastMsg?.audio_url)) {
            lastMessage = lastMsg.image_url ? "📷 Photo" : "🎤 Voice message";
          }

          return {
            conversationId: p.id,
            userId: p.id,
            username: p.username ?? "(unknown)",
            avatar_url: p.avatar_url ?? null,
            online: p.online ?? false,
            last_seen: p.last_seen ?? new Date().toISOString(),
            lastMessage: lastMessage ?? "No messages yet",
            lastAt: lastMsg?.created_at ?? null,
            unread,
            credit: 0,
            isSpam: false,
            isAdmin: adminUsers.has(p.id),
            isSuperAdmin: superAdminUsers.has(p.id),
          };
        });

      const gRows: ConvRow[] = adminGroups.map((g: any) => {
        const gMsgs = (groupMsgs ?? []).filter((msg: any) => msg.group_id === g.id);
        const lastMsg = gMsgs[0];
        const unread = gMsgs.filter((msg: any) => msg.sender_id !== meId && !msg.seen).length;

        let lastMessage = lastMsg?.content ?? null;
        if (lastMessage?.startsWith("[system:reaction:")) {
          lastMessage = "Reacted to a message";
        } else if (lastMessage?.startsWith("[system:unsent]")) {
          lastMessage = "Unsent a message";
        } else if (lastMessage?.startsWith("[reply:")) {
          const match = lastMessage.match(/^\[reply:[^\]]+\]\s*([\s\S]*)/);
          if (match) lastMessage = match[1];
        } else if (lastMessage && isSystemMessage(lastMessage)) {
          lastMessage = formatSystemMessage(lastMessage, lastMsg.sender?.username);
        }

        return {
          conversationId: `group-${g.id}`,
          userId: g.created_by,
          username: g.name || "Unnamed Group",
          avatar_url: g.avatar_url,
          online: false,
          last_seen: g.created_at,
          lastMessage: lastMessage ?? "Group created",
          lastAt: lastMsg?.created_at ?? g.created_at,
          unread,
          credit: 0,
          isSpam: false,
          isGroup: true,
        };
      });

      setConvs(dmRows);
      setGroupRows(gRows);

      try {
        localStorage.setItem("jj_cached_team_conversations", JSON.stringify(dmRows));
      } catch { }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load team conversations");
    } finally {
      setLoadingConvs(false);
    }
  }

  useEffect(() => {
    load();
    let mounted = true;
    const rand = Math.random().toString(36).slice(2, 9);
    const ch = supabase
      .channel(`admin-teamchat-${rand}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        if (!mounted) return;
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        if (mounted) load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => {
        if (mounted) load();
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [meId]);

  useEffect(() => {
    if (activeId) {
      setConvs((prev) =>
        prev.map((c) => (c.conversationId === activeId ? { ...c, unread: 0 } : c))
      );
      setGroupRows((prev) =>
        prev.map((c) => (c.conversationId === activeId ? { ...c, unread: 0 } : c))
      );
    }
  }, [activeId]);

  const filtered = viewGroups
    ? groupRows.filter((u) => !search || u.username.toLowerCase().includes(search.toLowerCase()))
    : (() => {
      const baseConvs = [...convs, ...groupRows];
      return baseConvs.filter((u) => {
        if (search && !u.username.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      });
    })();

  const sorted = [...filtered].sort((a, b) => {
    const aPinned = pinnedConvs.includes(a.conversationId);
    const bPinned = pinnedConvs.includes(b.conversationId);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
  });

  const active = (convs.find((u) => u.conversationId === activeId) || groupRows.find((u) => u.conversationId === activeId)) ?? null;
  const onlineUsers = convs.filter((u) => u.online);

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar List */}
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
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Team Chat</p>
            </div>
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
              onClick={() => { setViewGroups(false); }}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border ${!viewGroups ? "bg-primary text-primary-foreground border-transparent" : "bg-secondary border-transparent text-muted-foreground"}`}
            >
              All
            </button>
            <button
              onClick={() => { setViewGroups(true); }}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border inline-flex items-center gap-1 ${viewGroups ? "bg-primary text-primary-foreground border-transparent" : "bg-secondary border-transparent text-muted-foreground"}`}
            >
              Groups
            </button>
          </div>

          <div className="relative mt-3">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-full bg-secondary border-transparent"
            />
          </div>
        </div>

        <PullToRefresh onRefresh={load}>
          {viewGroups && (
            <button
              onClick={() => setCreateGroupOpen(true)}
              className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-2xl text-left bg-primary/10 hover:bg-primary/15 text-primary border border-primary/15 transition-all font-semibold w-[calc(100%-1rem)]"
            >
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                <Plus className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight">Create Group Chat</p>
                <p className="text-[10px] text-muted-foreground/90 truncate leading-snug">Start a staff team group chat</p>
              </div>
            </button>
          )}

          {loadingConvs && (viewGroups ? groupRows.length === 0 : convs.length === 0) ? (
            <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Loading chats…</span>
            </div>
          ) : sorted.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{viewGroups ? "No groups yet." : "No staff members found."}</p>
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
                    {u.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
                  </div>
                  <div className="flex-1 min-w-0 pr-9">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`truncate text-sm flex items-center gap-1.5 ${u.unread ? "font-bold" : "font-semibold"}`}>
                        {u.username}
                        {u.isSuperAdmin ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-amber-500 fill-amber-500/10 shrink-0" title="Super Admin" />
                        ) : u.isAdmin ? (
                          <Shield className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10 shrink-0" title="Admin" />
                        ) : null}
                        {isPinned && <Pin className="h-3.5 w-3.5 text-primary rotate-45 fill-primary shrink-0" />}
                      </p>
                      {u.lastAt && <span className="text-[11px] text-muted-foreground shrink-0">{formatDistanceToNow(new Date(u.lastAt), { addSuffix: false })}</span>}
                    </div>
                    <p className={`text-xs truncate ${u.unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {u.lastMessage ?? "No messages yet"}
                    </p>
                  </div>
                  {!!u.unread && <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-[10px] text-primary-foreground font-bold flex items-center justify-center shrink-0">{u.unread}</span>}
                </button>
              </div>
            );
          })}
        </PullToRefresh>
      </div>

      {/* Active Conversation Pane */}
      <div className={`${active ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col bg-background min-h-0`}>
        {active ? (
          <Conversation
            meId={meId}
            conv={active}
            convs={convs}
            messages={messages}
            setMessages={setMessages}
            onUserClick={onUserClick}
            onBack={() => setActiveId(null)}
            onOpenDetail={() => setDetailOpen(true)}
            onToggleSpam={() => { }}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            activeMatch={activeMatch}
            setActiveMatch={setActiveMatch}
            isTeamChat={true}
            onLastMessageUpdate={(content, image_url, audio_url, created_at) => {
              const updater = (prev: ConvRow[]) => {
                const idx = prev.findIndex((c) => c.conversationId === active.conversationId);
                if (idx === -1) return prev;
                let preview = content;
                if (!preview) {
                  preview = image_url ? "📷 Photo" : audio_url ? "🎤 Voice message" : "Message";
                }
                if (preview && isSystemMessage(preview)) {
                  preview = formatSystemMessage(preview);
                }
                const copy = [...prev];
                const updated = { ...copy[idx] };
                updated.lastMessage = preview;
                updated.lastAt = created_at;
                copy[idx] = updated;
                return copy.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
              };
              if (active.isGroup || active.conversationId.startsWith("group-")) {
                setGroupRows(updater);
              } else {
                setConvs(updater);
              }
            }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Select a conversation to start team chatting.</p>
          </div>
        )}
      </div>

      {detailOpen && active && (
        <aside className="w-80 border-l border-border bg-card hidden lg:flex flex-col overflow-y-auto shrink-0 animate-in slide-in-from-right duration-200">
          {selectedMemberProfile ? (
            <UserDetailPanel
              userId={selectedMemberProfile.id}
              username={selectedMemberProfile.username}
              avatar={selectedMemberProfile.avatar_url}
              variant="embedded"
              onClose={() => setSelectedMemberProfile(null)}
              onCreateGroupClick={() => handleOpenCreateGroupForUser(selectedMemberProfile.id)}
              onSearchClick={() => {
                setDetailOpen(false);
                setSearchOpen(true);
                setSearchQuery("");
                setActiveMatch(0);
              }}
              onShareClick={() => handleShareProfile(selectedMemberProfile.id, selectedMemberProfile.username, selectedMemberProfile.avatar_url)}
              onWalletClick={() => {
                loadWalletDetails(selectedMemberProfile.id);
                setWalletPopupOpen(true);
              }}
              onHistoryClick={() => {
                loadWalletHistory("all", selectedMemberProfile.id);
                setWalletHistoryPopupOpen(true);
              }}
              onUserClick={onUserClick}
            />
          ) : active.isGroup ? (
            <GroupDetailPanel
              group={activeGroup}
              members={activeGroupMembers}
              messages={messages}
              meId={meId}
              onClose={() => setDetailOpen(false)}
              onLeave={handleLeaveGroup}
              onUpdateName={handleUpdateGroupName}
              onUpdateAvatar={handleUpdateGroupAvatar}
              onAddMembers={() => setAddMembersOpen(true)}
              onShare={() => setShareOpen(true)}
              onRemoveMember={handleRemoveMember}
              onPromoteMember={handlePromoteMember}
              onMemberClick={(userId, username, avatarUrl) => {
                setSelectedMemberProfile({ id: userId, username, avatar_url: avatarUrl });
              }}
            />
          ) : (
            <UserDetailPanel
              userId={active.userId}
              username={active.username}
              avatar={active.avatar_url}
              variant="embedded"
              onClose={() => setDetailOpen(false)}
              onCreateGroupClick={() => handleOpenCreateGroupForUser(active.userId)}
              onSearchClick={() => {
                setDetailOpen(false);
                setSearchOpen(true);
                setSearchQuery("");
                setActiveMatch(0);
              }}
              onShareClick={() => handleShareProfile(active.userId, active.username, active.avatar_url)}
              onWalletClick={() => {
                loadWalletDetails(active.userId);
                setWalletPopupOpen(true);
              }}
              onHistoryClick={() => {
                loadWalletHistory("all", active.userId);
                setWalletHistoryPopupOpen(true);
              }}
              onUserClick={onUserClick}
            />
          )}
        </aside>
      )}

      <Sheet open={detailOpen && !!active && !isDesktop} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-none p-0 lg:hidden flex flex-col h-full bg-card [&>button]:hidden">
          {active && (
            selectedMemberProfile ? (
              <UserDetailPanel
                userId={selectedMemberProfile.id}
                username={selectedMemberProfile.username}
                avatar={selectedMemberProfile.avatar_url}
                variant="embedded"
                onClose={() => setSelectedMemberProfile(null)}
                onCreateGroupClick={() => handleOpenCreateGroupForUser(selectedMemberProfile.id)}
                onSearchClick={() => {
                  setDetailOpen(false);
                  setSearchOpen(true);
                  setSearchQuery("");
                  setActiveMatch(0);
                }}
                onShareClick={() => handleShareProfile(selectedMemberProfile.id, selectedMemberProfile.username, selectedMemberProfile.avatar_url)}
                onWalletClick={() => {
                  loadWalletDetails(selectedMemberProfile.id);
                  setWalletPopupOpen(true);
                }}
                onHistoryClick={() => {
                  loadWalletHistory("all", selectedMemberProfile.id);
                  setWalletHistoryPopupOpen(true);
                }}
                onUserClick={onUserClick}
              />
            ) : active.isGroup ? (
              <div className="flex-1 overflow-y-auto min-h-0">
                <GroupDetailPanel
                  group={activeGroup}
                  members={activeGroupMembers}
                  messages={messages}
                  meId={meId}
                  onClose={() => setDetailOpen(false)}
                  onLeave={handleLeaveGroup}
                  onUpdateName={handleUpdateGroupName}
                  onUpdateAvatar={handleUpdateGroupAvatar}
                  onAddMembers={() => setAddMembersOpen(true)}
                  onShare={() => setShareOpen(true)}
                  onRemoveMember={handleRemoveMember}
                  onPromoteMember={handlePromoteMember}
                  onMemberClick={(userId, username, avatarUrl) => {
                    setSelectedMemberProfile({ id: userId, username, avatar_url: avatarUrl });
                  }}
                />
              </div>
            ) : (
              <UserDetailPanel
                userId={active.userId}
                username={active.username}
                avatar={active.avatar_url}
                variant="embedded"
                onClose={() => setDetailOpen(false)}
                onCreateGroupClick={() => handleOpenCreateGroupForUser(active.userId)}
                onSearchClick={() => {
                  setDetailOpen(false);
                  setSearchOpen(true);
                  setSearchQuery("");
                  setActiveMatch(0);
                }}
                onShareClick={() => handleShareProfile(active.userId, active.username, active.avatar_url)}
                onWalletClick={() => {
                  loadWalletDetails(active.userId);
                  setWalletPopupOpen(true);
                }}
                onHistoryClick={() => {
                  loadWalletHistory("all", active.userId);
                  setWalletHistoryPopupOpen(true);
                }}
                onUserClick={onUserClick}
              />
            )
          )}
        </SheetContent>
      </Sheet>

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => {
          setCreateGroupOpen(false);
          setPreselectedFriendId(undefined);
        }}
        meId={meId}
        isAdminOrSuper={true}
        isAdminTeamChat={true}
        preselectedMemberId={preselectedFriendId}
        onGroupCreated={(groupId) => {
          load();
          setActiveId(`group-${groupId}`);
        }}
      />

      {/* Group Add Members Modal */}
      {addMembersOpen && activeGroup && (
        <GroupAddMembersModal
          open={addMembersOpen}
          onClose={() => setAddMembersOpen(false)}
          groupId={activeGroup.id}
          meId={meId}
          isAdminOrSuper={true}
          isAdminTeamChat={true}
          onMembersAdded={() => {
            supabase.from("group_members").select("*, profiles:user_id(id, username, first_name, last_name, avatar_url)").eq("group_id", activeGroup.id).then(({ data }) => {
              if (data) setActiveGroupMembers(data);
            });
            load();
          }}
        />
      )}

      {/* Group Share Modal */}
      {shareOpen && activeGroup && (
        <GroupShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          groupId={activeGroup.id}
          groupName={activeGroup.name || "Group"}
          meId={meId}
        />
      )}

      {contextMenuTarget && (() => {
        const targetConv = convs.find(c => c.conversationId === contextMenuTarget) || groupRows.find(c => c.conversationId === contextMenuTarget);
        if (!targetConv) return null;
        const isPinned = pinnedConvs.includes(contextMenuTarget);

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

      {shareProfileOpen && shareProfileTarget && (
        <ShareProfileModal
          isOpen={shareProfileOpen}
          onOpenChange={setShareProfileOpen}
          username={shareProfileTarget.username}
          displayName={shareProfileTarget.displayName}
          avatarUrl={shareProfileTarget.avatarUrl}
          memberSince={shareProfileTarget.memberSince}
        />
      )}
    </div>
  );
}

type PageMsg = { id: string; sender_id: string; content: string | null; image_url: string | null; audio_url: string | null; created_at: string; seen: boolean; from_page: boolean; failed?: boolean };
type CallRow = { id: string; caller_id: string; callee_id: string; call_type: "voice" | "video"; status: "ringing" | "active" | "ended" | "missed" | "declined" | "canceled"; duration_seconds: number; created_at: string };

function Conversation({
  meId,
  conv,
  convs = [],
  messages,
  setMessages,
  onBack,
  onOpenDetail,
  onToggleSpam,
  onLastMessageUpdate,
  searchOpen,
  setSearchOpen,
  searchQuery,
  setSearchQuery,
  activeMatch,
  setActiveMatch,
  isTeamChat = false,
  onUserClick,
}: {
  meId: string;
  conv: ConvRow;
  convs?: ConvRow[];
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  onBack: () => void;
  onOpenDetail: () => void;
  onToggleSpam: () => void;
  onLastMessageUpdate: (content: string | null, image_url: string | null, audio_url: string | null, created_at: string) => void;
  searchOpen: boolean;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  activeMatch: number;
  setActiveMatch: React.Dispatch<React.SetStateAction<number>>;
  isTeamChat?: boolean;
  onUserClick?: (userId: string) => void;
}) {
  const { startCall } = useCalls();
  const navigate = useNavigate();
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const isGroup = conv.isGroup || conv.conversationId.startsWith("group-");
  const groupId = isGroup ? conv.conversationId.replace("group-", "") : null;
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [currentUser, setCurrentUser] = useState<any>(null);
  const typingChannelRef = useRef<any>(null);

  useEffect(() => {
    if (meId) {
      supabase.from("profiles").select("*").eq("id", meId).maybeSingle().then(({ data }) => {
        if (data) setCurrentUser(data);
      });
    }
  }, [meId]);

  useEffect(() => {
    if (conv.conversationId && messages.length > 0) {
      const cacheKey = isTeamChat
        ? `admin-teamchat-${conv.conversationId}`
        : isGroup
        ? `admin-group-${conv.conversationId}`
        : `admin-page-${conv.conversationId}`;
      const persistent = messages.filter(m => m.id && typeof m.id === "string" && !m.id.startsWith("temp-") && !m.failed);
      if (persistent.length > 0) {
        setCachedPageMessages(cacheKey, persistent);
      }
    }
  }, [messages, conv.conversationId, isGroup, isTeamChat]);

  useEffect(() => {
    if (!isGroup || !meId || !groupId) return;

    // Clean up any existing channel with the same name to prevent callbacks error
    if (supabase.realtime?.channels) {
      supabase.realtime.channels = supabase.realtime.channels.filter(c =>
        c.topic !== `realtime:typing-${groupId}` &&
        c.topic !== `typing-${groupId}`
      );
    }

    const typingChannel = supabase.channel(`typing-${groupId}`);
    typingChannelRef.current = typingChannel;

    typingChannel
      .on("presence", { event: "sync" }, () => {
        const state = typingChannel.presenceState();
        const users = new Set<string>();
        for (const key of Object.keys(state)) {
          const presences = state[key] as any[];
          presences.forEach(p => {
            if (p.isTyping && p.userId !== meId) {
              users.add(p.username);
            }
          });
        }
        setTypingUsers(users);
      })
      .subscribe();

    return () => {
      typingChannelRef.current = null;
      supabase.removeChannel(typingChannel);
    };
  }, [isGroup, meId, groupId]);

  const lastTypingTimeRef = useRef(0);
  const handleTextChange = (val: string) => {
    setText(val);
    if (!isGroup || !meId || !groupId) return;
    const now = Date.now();
    if (now - lastTypingTimeRef.current > 2000) {
      lastTypingTimeRef.current = now;
      if (typingChannelRef.current) {
        typingChannelRef.current.track({
          userId: meId,
          username: currentUser?.username || "Someone",
          isTyping: val.trim().length > 0
        }).then();
      }
    }
  };

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

  const [selectedMentionProfile, setSelectedMentionProfile] = useState<any>(null);
  const [mentionOptionsOpen, setMentionOptionsOpen] = useState(false);
  const [isFriendOfMine, setIsFriendOfMine] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [checkingFriendship, setCheckingFriendship] = useState(false);

  const handleAddFriend = async () => {
    if (!meId || !selectedMentionProfile) return;
    try {
      const { error } = await supabase.from("friend_requests").insert({
        sender_id: meId,
        receiver_id: selectedMentionProfile.id,
        status: "pending"
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Friend request sent successfully!");
        setFriendRequestSent(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send friend request");
    }
  };

  const handleMentionClick = async (username: string) => {
    console.log("handleMentionClick called with username:", username);
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, first_name, last_name, avatar_url, online")
        .ilike("username", username)
        .maybeSingle();

      if (error) {
        console.error("Error querying profiles inside handleMentionClick:", error);
      }
      console.log("Query result profile:", profile);

      if (profile) {
        setSelectedMentionProfile(profile);
        setMentionOptionsOpen(true);
        setFriendRequestSent(false); // Reset sent state
        
        if (meId && profile.id !== meId) {
          setCheckingFriendship(true);
          const { data } = await supabase
            .from("friendships")
            .select("user_a, user_b")
            .or(`and(user_a.eq.${meId},user_b.eq.${profile.id}),and(user_a.eq.${profile.id},user_b.eq.${meId})`)
            .maybeSingle();
          setIsFriendOfMine(!!data);
          setCheckingFriendship(false);
        } else {
          setIsFriendOfMine(false);
        }
      } else {
        toast.error(`User @${username} not found.`);
      }
    } catch (err) {
      console.error("Exception in handleMentionClick:", err);
    }
  };

  const [groupMembers, setGroupMembers] = useState<any[]>([]);

  useEffect(() => {
    console.log("Admin Conversation mounted. isGroup:", isGroup, "groupId:", groupId);
    if (isGroup && groupId) {
      supabase
        .from("group_members")
        .select("profiles:user_id(id, username, first_name, last_name, avatar_url)")
        .eq("group_id", groupId)
        .then(({ data, error }) => {
          if (error) {
            console.error("Error fetching group members in Admin:", error);
          }
          console.log("Raw group members data in Admin:", data);
          if (data) {
            const list = data.map((m: any) => m.profiles || m["profiles:user_id"]).filter(Boolean);
            console.log("Mapped group members list in Admin:", list);
            setGroupMembers(list);
          }
        });
    } else {
      setGroupMembers([]);
    }
  }, [isGroup, groupId]);

  const [mentionSearch, _setMentionSearch] = useState<string | null>(null);
  const setMentionSearch = (val: string | null) => {
    console.log("setMentionSearch called with value:", val, "stack:", new Error().stack);
    _setMentionSearch(val);
  };
  const [mentionIdx, setMentionIdx] = useState(0);

  const filteredMembers = useMemo(() => {
    console.log("filteredMembers hook triggered. mentionSearch:", mentionSearch, "groupMembers count:", groupMembers.length);
    if (mentionSearch === null) return [];
    const query = mentionSearch.toLowerCase();
    const seen = new Set<string>();
    const uniqueList: any[] = [];
     groupMembers.forEach((p: any) => {
      if (p && p.id && p.id !== meId && !seen.has(p.id)) {
        seen.add(p.id);
        uniqueList.push(p);
      }
    });
    const result = uniqueList.filter((p: any) =>
      p.username?.toLowerCase().includes(query) ||
      p.first_name?.toLowerCase().includes(query) ||
      p.last_name?.toLowerCase().includes(query)
    );
    console.log("filteredMembers result:", result);
    return result;
  }, [mentionSearch, groupMembers]);

  const handleMentionCheck = (textValue: string, selectionStart: number) => {
    console.log("handleMentionCheck run. text:", textValue, "selectionStart:", selectionStart);
    const beforeCursor = textValue.substring(0, selectionStart);
    const lastAt = beforeCursor.lastIndexOf("@");
    console.log("lastAt index:", lastAt);
    if (lastAt !== -1) {
      const textAfterAt = beforeCursor.substring(lastAt + 1);
      console.log("textAfterAt:", textAfterAt);
      if (!textAfterAt.includes(" ")) {
        console.log("Setting mentionSearch to:", textAfterAt);
        setMentionSearch(textAfterAt);
        setMentionIdx(0);
        return;
      }
    }
    setMentionSearch(null);
  };

  const insertMention = (selectedUsername: string) => {
    if (!inputRef.current) return;
    const el = inputRef.current;
    const val = el.value;
    const selectionStart = el.selectionStart || 0;
    const beforeCursor = val.substring(0, selectionStart);
    const lastAt = beforeCursor.lastIndexOf("@");
    if (lastAt !== -1) {
      const beforeAt = val.substring(0, lastAt);
      const afterCursor = val.substring(selectionStart);
      const nextText = `${beforeAt}@${selectedUsername} ${afterCursor}`;
      setText(nextText);
      setMentionSearch(null);
      setTimeout(() => {
        el.focus();
        const nextPos = lastAt + selectedUsername.length + 2;
        el.setSelectionRange(nextPos, nextPos);
      }, 50);
    }
  };
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

  // Wallet Credit System States
  const { isSuperAdmin } = useRole();
  const [walletPopupOpen, setWalletPopupOpen] = useState(false);
  const [walletHistoryPopupOpen, setWalletHistoryPopupOpen] = useState(false);

  // Cash In / Cash Out States
  const [cashInPopupOpen, setCashInPopupOpen] = useState(false);
  const [cashOutPopupOpen, setCashOutPopupOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [cashNotes, setCashNotes] = useState("");
  const [performingCashAction, setPerformingCashAction] = useState(false);
  const [walletDetails, setWalletDetails] = useState<any>(null);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [loadingWalletDetails, setLoadingWalletDetails] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Wallet action fields
  const [walletAction, setWalletAction] = useState<any>("deposit");
  const [walletAmount, setWalletAmount] = useState("");
  const [walletPaymentMethod, setWalletPaymentMethod] = useState("Cashapp");
  const [walletNotes, setWalletNotes] = useState("");
  const [performingWalletAction, setPerformingWalletAction] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Edit Transaction States
  const [editTxOpen, setEditTxOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [editTxAmount, setEditTxAmount] = useState("");
  const [editTxReason, setEditTxReason] = useState("");
  const [editTxNotes, setEditTxNotes] = useState("");
  const [editTxCreatedAt, setEditTxCreatedAt] = useState("");

  // Delete Transaction States
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmTxId, setDeleteConfirmTxId] = useState<string | null>(null);

  // Reset date/ledger filters when active conversation changes
  useEffect(() => {
    setStartDate("");
    setEndDate("");
    setHistoryFilter("all");
  }, [conv.conversationId]);

  // Reset wallet dialog fields when modal opens
  useEffect(() => {
    if (walletPopupOpen) {
      setWalletAction("deposit");
      setWalletPaymentMethod("Cashapp");
      setWalletAmount("");
      setWalletNotes("");
    }
  }, [walletPopupOpen]);

  // Automatically select "Credit" payment method when Load Credit is selected
  useEffect(() => {
    if (walletAction === "credit_added") {
      setWalletPaymentMethod("Credit");
    } else if (walletAction === "deposit" || walletAction === "deduct_credit") {
      if (walletPaymentMethod === "Credit") {
        setWalletPaymentMethod("Cashapp");
      }
    }
  }, [walletAction]);

  const loadWalletDetails = async (customUserId?: string) => {
    const targetUserId = customUserId || conv.userId;
    if (!targetUserId) return;
    setLoadingWalletDetails(true);
    try {
      const { getWalletDetailsAdmin } = await import("@/lib/wallet.functions");
      const res = await getWalletDetailsAdmin({ data: { targetUserId } });
      setWalletDetails(res.profile);
      setWalletTransactions(res.transactions ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load wallet stats");
    } finally {
      setLoadingWalletDetails(false);
    }
  };

  const loadWalletHistory = async (filterVal: string, customUserId?: string, start?: string, end?: string) => {
    const targetUserId = customUserId || conv.userId;
    if (!targetUserId) return;
    setLoadingHistory(true);
    loadWalletDetails(targetUserId);
    try {
      const { getWalletHistoryAdmin } = await import("@/lib/wallet.functions");
      const res = await getWalletHistoryAdmin({
        data: {
          targetUserId,
          filter: filterVal,
          startDate: start !== undefined ? start : startDate || undefined,
          endDate: end !== undefined ? end : endDate || undefined,
        }
      });
      setWalletTransactions(res ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load wallet ledger history");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenEditTx = (tx: any) => {
    setSelectedTx(tx);
    setEditTxAmount(tx.amount.toString());
    setEditTxReason(tx.reason);
    setEditTxNotes(tx.notes || "");
    
    // convert UTC date to datetime-local formatted local string
    const dateObj = new Date(tx.created_at);
    const offset = dateObj.getTimezoneOffset();
    const localDateObj = new Date(dateObj.getTime() - offset * 60 * 1000);
    setEditTxCreatedAt(localDateObj.toISOString().slice(0, 16));
    
    setEditTxOpen(true);
  };

  const submitEditTx = async () => {
    if (!selectedTx) return;
    if (!editTxAmount || isNaN(Number(editTxAmount)) || Number(editTxAmount) < 0) {
      return toast.error("Please enter a valid positive amount.");
    }
    try {
      const { editWalletTransactionAdmin } = await import("@/lib/wallet.functions");
      const isoDate = new Date(editTxCreatedAt).toISOString();
      const res = await editWalletTransactionAdmin({
        data: {
          transactionId: selectedTx.id,
          newAmount: Number(editTxAmount),
          newReason: editTxReason,
          newNotes: editTxNotes || undefined,
          newCreatedAt: isoDate
        }
      });
      if (res.success) {
        toast.success("Transaction updated successfully!");
        setEditTxOpen(false);
        loadWalletHistory(historyFilter);
        loadWalletDetails();

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("wallet-updated", {
              detail: {
                userId: res.userId,
                wallet_balance: res.wallet_balance,
                credit_balance: res.credit_balance,
              },
            })
          );
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update transaction");
    }
  };

  const handleDeleteTx = (txId: string) => {
    setDeleteConfirmTxId(txId);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteTx = async () => {
    if (!deleteConfirmTxId) return;
    try {
      const { deleteWalletTransactionAdmin } = await import("@/lib/wallet.functions");
      const res = await deleteWalletTransactionAdmin({
        data: { transactionId: deleteConfirmTxId }
      });
      if (res.success) {
        toast.success("Transaction deleted successfully!");
        loadWalletHistory(historyFilter);
        loadWalletDetails();

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("wallet-updated", {
              detail: {
                userId: res.userId,
                wallet_balance: res.wallet_balance,
                credit_balance: res.credit_balance,
              },
            })
          );
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete transaction");
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteConfirmTxId(null);
    }
  };

  const submitWalletAction = async () => {
    if (!walletAmount && walletAction !== "reset") {
      return toast.error("Please enter a valid amount.");
    }
    const amt = walletAction === "reset" ? 0 : Number(walletAmount);
    if (isNaN(amt) || (amt < 0 && walletAction !== "reset")) {
      return toast.error("Amount must be a non-negative number.");
    }

    let computedReason = "";
    if (walletAction === "deposit") {
      computedReason = `${walletPaymentMethod} Load`;
    } else if (walletAction === "credit_added") {
      computedReason = `${walletPaymentMethod} Credit Load`;
    } else if (walletAction === "deduction") {
      computedReason = "Played Funds";
    } else if (walletAction === "deduct_credit") {
      computedReason = `${walletPaymentMethod} Paid Credit`;
    } else {
      computedReason = "Manual adjustment";
    }

    setPerformingWalletAction(true);
    try {
      const { performWalletActionAdmin } = await import("@/lib/wallet.functions");
      const res = await performWalletActionAdmin({
        data: {
          targetUserId: conv.userId,
          action: walletAction,
          amount: amt,
          reason: computedReason,
          notes: walletNotes || undefined,
        }
      });

      if (res.success) {
        toast.success("Wallet updated successfully!");
        setWalletAmount("");
        setWalletNotes("");
        // Reload details
        loadWalletDetails();

        // Broadcast global event to sync balances across components instantly
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("wallet-updated", {
              detail: {
                userId: conv.userId,
                wallet_balance: res.wallet_balance,
                credit_balance: res.credit_balance,
              },
            })
          );
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update wallet");
    } finally {
      setPerformingWalletAction(false);
    }
  };
  
  const submitCashIn = async () => {
    if (!cashAmount) {
      return toast.error("Please enter a valid amount.");
    }
    const amt = Number(cashAmount);
    if (isNaN(amt) || amt <= 0) {
      return toast.error("Amount must be a positive number.");
    }
    setPerformingCashAction(true);
    try {
      const { performWalletActionAdmin } = await import("@/lib/wallet.functions");
      const res = await performWalletActionAdmin({
        data: {
          targetUserId: conv.userId,
          action: "cashin",
          amount: amt,
          reason: "Cash In",
          notes: cashNotes || undefined,
        }
      });
      if (res.success) {
        toast.success("Cash In logged successfully!");
        setCashAmount("");
        setCashNotes("");
        setCashInPopupOpen(false);
        loadWalletDetails();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to log Cash In");
    } finally {
      setPerformingCashAction(false);
    }
  };

  const submitCashOut = async () => {
    if (!cashAmount) {
      return toast.error("Please enter a valid amount.");
    }
    const amt = Number(cashAmount);
    if (isNaN(amt) || amt <= 0) {
      return toast.error("Amount must be a positive number.");
    }
    setPerformingCashAction(true);
    try {
      const { performWalletActionAdmin } = await import("@/lib/wallet.functions");
      const res = await performWalletActionAdmin({
        data: {
          targetUserId: conv.userId,
          action: "cashout",
          amount: amt,
          reason: "Cash Out",
          notes: cashNotes || undefined,
        }
      });
      if (res.success) {
        toast.success("Cash Out logged successfully!");
        setCashAmount("");
        setCashNotes("");
        setCashOutPopupOpen(false);
        loadWalletDetails();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to log Cash Out");
    } finally {
      setPerformingCashAction(false);
    }
  };

  const handleResetWallet = async () => {
    if (!isSuperAdmin) {
      return toast.error("Only super admins can reset wallets.");
    }
    const confirmed = window.confirm("WARNING: Are you absolutely sure you want to RESET this user's wallet balances and stats to zero? This action cannot be undone.");
    if (!confirmed) return;

    setPerformingWalletAction(true);
    try {
      const { performWalletActionAdmin } = await import("@/lib/wallet.functions");
      const res = await performWalletActionAdmin({
        data: {
          targetUserId: conv.userId,
          action: "reset",
          amount: 0,
          reason: "Super Admin Wallet Reset",
          notes: "Perform total reset of available and credit balances",
        }
      });

      if (res.success) {
        toast.success("Wallet reset successfully!");
        loadWalletDetails();

        // Broadcast global event to sync balances across components instantly
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("wallet-updated", {
              detail: {
                userId: conv.userId,
                wallet_balance: res.wallet_balance,
                credit_balance: res.credit_balance,
              },
            })
          );
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to reset wallet");
    } finally {
      setPerformingWalletAction(false);
    }
  };

  const exportAdminCSV = () => {
    if (walletTransactions.length === 0) return toast.error("No transactions to export.");

    const checkIsPositive = (action: string) => ["deposit", "credit_added", "refund", "bonus", "cashin"].includes(action);

    let headers: string[] = [];
    let rows: any[][] = [];

    const cashInTotal = walletTransactions
      .filter(tx => tx.action === "cashin" && !tx.deleted)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const cashOutTotal = walletTransactions
      .filter(tx => tx.action === "cashout" && !tx.deleted)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const netCashFlow = cashInTotal - cashOutTotal;

    if (historyFilter === "wallet") {
      headers = ["Date & Time", "Action", "Amount", "Avail Before", "Avail After", "Reason", "Admin Name", "Notes", "Status"];
      rows = walletTransactions.map(tx => [
        new Date(tx.created_at).toLocaleString(),
        tx.action.toUpperCase(),
        `${checkIsPositive(tx.action) ? "+" : "-"}$${Number(tx.amount).toFixed(2)}`,
        `$${Number(tx.avail_before).toFixed(2)}`,
        `$${Number(tx.avail_after).toFixed(2)}`,
        tx.reason,
        tx.admin_name || "Admin",
        tx.notes || "",
        tx.deleted ? "DELETED" : tx.edited ? "EDITED" : "ACTIVE"
      ]);
    } else if (historyFilter === "credit") {
      headers = ["Date & Time", "Action", "Amount", "Credit Before", "Credit After", "Reason", "Admin Name", "Notes", "Status"];
      rows = walletTransactions.map(tx => [
        new Date(tx.created_at).toLocaleString(),
        tx.action.toUpperCase(),
        `${checkIsPositive(tx.action) ? "+" : "-"}$${Number(tx.amount).toFixed(2)}`,
        `$${Number(tx.credit_before).toFixed(2)}`,
        `$${Number(tx.credit_after).toFixed(2)}`,
        tx.reason,
        tx.admin_name || "Admin",
        tx.notes || "",
        tx.deleted ? "DELETED" : tx.edited ? "EDITED" : "ACTIVE"
      ]);
    } else {
      headers = ["Date & Time", "Action", "Amount", "Avail Before", "Avail After", "Credit Before", "Credit After", "Reason", "Admin Name", "Notes", "Status", "Original Amount", "Edited At", "Deleted At"];
      rows = walletTransactions.map(tx => [
        new Date(tx.created_at).toLocaleString(),
        tx.action.toUpperCase(),
        `${checkIsPositive(tx.action) ? "+" : "-"}$${Number(tx.amount).toFixed(2)}`,
        `$${Number(tx.avail_before).toFixed(2)}`,
        `$${Number(tx.avail_after).toFixed(2)}`,
        `$${Number(tx.credit_before).toFixed(2)}`,
        `$${Number(tx.credit_after).toFixed(2)}`,
        tx.reason,
        tx.admin_name || "Admin",
        tx.notes || "",
        tx.deleted ? "DELETED" : tx.edited ? "EDITED" : "ACTIVE",
        tx.original_amount !== null && tx.original_amount !== undefined ? `$${Number(tx.original_amount).toFixed(2)}` : "",
        tx.edited_at ? new Date(tx.edited_at).toLocaleString() : "",
        tx.deleted_at ? new Date(tx.deleted_at).toLocaleString() : ""
      ]);

      rows.push([]);
      rows.push(["TOTAL CASH IN", "", `$${cashInTotal.toFixed(2)}`]);
      rows.push(["TOTAL CASH OUT", "", `$${cashOutTotal.toFixed(2)}`]);
      rows.push(["NET CASH FLOW (IN - OUT)", "", `$${netCashFlow.toFixed(2)}`]);
    }

    const csvContent = [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `JJ_Wallet_Ledger_${historyFilter.toUpperCase()}_Customer_${conv.username || "user"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV Statement exported successfully!");
  };

  const printAdminStatement = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Could not open print window.");

    const customerName = conv.username || "Customer";

    // Determine headers based on filter
    let tableHeaders = "";
    let colspan = 9;
    if (historyFilter === "wallet") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Avail. Before</th>
        <th style="text-align: right;">Avail. After</th>
        <th>Reason</th>
        <th>Admin</th>
      `;
      colspan = 7;
    } else if (historyFilter === "credit") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Credit Before</th>
        <th style="text-align: right;">Credit After</th>
        <th>Reason</th>
        <th>Admin</th>
      `;
      colspan = 7;
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
        <th>Admin</th>
      `;
      colspan = 9;
    }

    const txRows = walletTransactions.map(tx => {
      let cells = `
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(tx.created_at).toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-transform: uppercase; font-weight: bold;">${tx.action}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.amount).toFixed(2)}</td>
      `;

      if (historyFilter === "wallet") {
        cells += `
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_after).toFixed(2)}</td>
        `;
      } else if (historyFilter === "credit") {
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
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.admin_name || "Admin"}</td>
      `;

      return `<tr>${cells}</tr>`;
    }).join("");

    // Conditional summary stats
    const cashInTotal = walletTransactions
      .filter(tx => tx.action === "cashin" && !tx.deleted)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const cashOutTotal = walletTransactions
      .filter(tx => tx.action === "cashout" && !tx.deleted)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const netCashFlow = cashInTotal - cashOutTotal;

    let summaryHTML = "";
    if (historyFilter === "wallet") {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Available Balance:</strong> $${(walletDetails?.wallet_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Deposits:</strong> $${(walletDetails?.wallet_deposits ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Used:</strong> $${(walletDetails?.wallet_used ?? 0).toFixed(2)}</p>
        </div>
      `;
    } else if (historyFilter === "credit") {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Credit Balance:</strong> $${(walletDetails?.credit_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Released:</strong> $${(walletDetails?.wallet_released ?? 0).toFixed(2)}</p>
        </div>
      `;
    } else {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Available Balance:</strong> $${(walletDetails?.wallet_balance ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Credit Balance:</strong> $${(walletDetails?.credit_balance ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0; border-top: 1px dashed #ccc; padding-top: 4px; margin-top: 6px;"><strong>Total Cash In:</strong> $${cashInTotal.toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Total Cash Out:</strong> $${cashOutTotal.toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Net Cash Flow:</strong> $${netCashFlow.toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Deposits:</strong> $${(walletDetails?.wallet_deposits ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Released:</strong> $${(walletDetails?.wallet_released ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Used:</strong> $${(walletDetails?.wallet_used ?? 0).toFixed(2)}</p>
        </div>
      `;
    }

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
            <p style="margin: 4px 0 0 0; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Admin ledger statement</p>
          </div>
          <div>
            <h3 style="margin: 0;">Customer Name: ${customerName}</h3>
            <p style="margin: 4px 0; font-size: 13px;">Customer ID: ${conv.userId}</p>
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
  };

  const sendStatementToUser = async (method: "email" | "chat") => {
    if (!walletDetails) return toast.error("No wallet details loaded.");

    // Calculate period totals from walletTransactions (already filtered by date/ledger filters!)
    let periodDeposited = 0;
    let periodReleased = 0;
    let periodUsed = 0;

    walletTransactions.forEach(tx => {
      if (tx.deleted) return; // skip soft-deleted transactions
      const amt = Number(tx.amount);
      const action = tx.action.toLowerCase();
      if (action === "deposit") {
        periodDeposited += Math.abs(amt);
      } else if (action === "credit_added") {
        periodReleased += Math.abs(amt);
      } else if (action === "used" || action === "deduct_credit") {
        periodUsed += Math.abs(amt);
      }
    });

    try {
      const { sendWalletStatementAdmin } = await import("@/lib/wallet.functions");
      await sendWalletStatementAdmin({
        data: {
          targetUserId: conv.userId,
          method,
          openingBalance: walletDetails.wallet_balance,
          closingBalance: walletDetails.wallet_balance,
          transactions: walletTransactions,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          totalDeposited: periodDeposited,
          totalReleased: periodReleased,
          totalUsed: periodUsed,
          ledgerFilter: historyFilter,
        }
      });
      toast.success(`Statement sent via ${method === "chat" ? "Support Chat" : "Email"}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send statement");
    }
  };

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
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setActiveMatch(0);
  }, [conv.conversationId, setSearchOpen, setSearchQuery, setActiveMatch]);

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
    if (isGroup) {
      const { data } = await supabase
        .from("messages")
        .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(100);
      const reversed = ((data as any[]) ?? []).slice().reverse();
      const mapped = reversed.map((m: any) => ({
        ...m,
        from_page: m.sender_id === meId,
      }));
      setMessages(mapped);
      await supabase.from("messages").update({ seen: true } as any)
        .eq("group_id", groupId).neq("sender_id", meId).eq("seen", false);
      return;
    }

    if (isTeamChat) {
      const [{ data: msgsData }, { data: callRows }] = await Promise.all([
        supabase
          .from("messages")
          .select("*")
          .or(`and(sender_id.eq.${meId},receiver_id.eq.${conv.userId}),and(sender_id.eq.${conv.userId},receiver_id.eq.${meId})`)
          .is("group_id", null)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("calls")
          .select("id, caller_id, callee_id, call_type, status, duration_seconds, created_at")
          .eq("context", "friend")
          .or(`and(caller_id.eq.${meId},callee_id.eq.${conv.userId}),and(caller_id.eq.${conv.userId},callee_id.eq.${meId})`)
          .order("created_at", { ascending: true })
          .limit(200),
      ]);
      const fresh = (msgsData as any[]) ?? [];
      const reversed = [...fresh].reverse().map((m: any) => ({
        ...m,
        from_page: m.sender_id === meId,
      }));
      setMessages(reversed);
      setCalls(((callRows ?? []) as CallRow[]).filter((c) => c.status !== "ringing" && c.status !== "active"));
      await supabase.from("messages").update({ seen: true } as any)
        .eq("sender_id", conv.userId).eq("receiver_id", meId).eq("seen", false);
      return;
    }

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
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("calls")
          .select("id, caller_id, callee_id, call_type, status, duration_seconds, created_at")
          .eq("context", "page")
          .eq("page_conversation_id", conv.conversationId)
          .order("created_at", { ascending: true })
          .limit(200),
      ]);
      const fresh = (data as PageMsg[]) ?? [];
      const reversed = [...fresh].reverse();
      setMessages(reversed);
      setCachedPageMessages(cacheKey, reversed);
      setCalls(((callRows ?? []) as CallRow[]).filter((c) => c.status !== "ringing" && c.status !== "active"));
    }

    await supabase.from("page_messages").update({ seen: true })
      .eq("conversation_id", conv.conversationId).eq("from_page", false).eq("seen", false);
  }

  const activeIdRef = useRef(conv.conversationId);
  useEffect(() => {
    activeIdRef.current = conv.conversationId;
    if (!isGroup && !isTeamChat) {
      const cacheKey = `admin-page-${conv.conversationId}`;
      const cached = getCachedPageMessages(cacheKey);
      setMessages(cached || []);
    } else {
      setMessages([]);
    }

    load();
  }, [conv.conversationId]);

  useEffect(() => {
    if (!meId) return;

    const rand = Math.random().toString(36).slice(2, 9);

    if (isGroup) {
      const groupChannel = supabase
        .channel(`admin-active-group-chat-${groupId}-${rand}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` }, (payload) => {
          const m = payload.new as any;
          if (m) {
            supabase.from("profiles").select("id, username, first_name, last_name, avatar_url, vip_status")
              .eq("id", m.sender_id).maybeSingle().then(({ data: sender }) => {
                const mappedMsg = {
                  ...m,
                  from_page: m.sender_id === meId,
                  sender: sender || null,
                };
                setMessages((prev) => {
                  if (prev.some((x) => x.id === m.id)) return prev;
                  return [...prev, mappedMsg];
                });
                if (m.sender_id !== meId) {
                  supabase.from("messages").update({ seen: true } as any).eq("id", m.id).then();
                }
              });
          }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` }, (payload) => {
          const m = payload.new as any;
          if (m) {
            setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, ...m } : x));
          }
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` }, (payload) => {
          const m = payload.old as any;
          if (m) {
            setMessages((prev) => prev.filter((x) => x.id !== m.id));
          }
        })
        .subscribe();
      return () => { supabase.removeChannel(groupChannel); };
    }

    if (isTeamChat) {
      const teamChannel = supabase
        .channel(`admin-teamchat-dm-${rand}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          const m = payload.new as any;
          if (m && !m.group_id) {
            const isMatch = (m.sender_id === meId && m.receiver_id === conv.userId) ||
              (m.sender_id === conv.userId && m.receiver_id === meId);
            if (isMatch) {
              setMessages((prev) => {
                if (prev.some((x) => x.id === m.id)) return prev;
                const idx = prev.findIndex((x) =>
                  typeof x.id === "string" && x.id.startsWith("temp-") &&
                  x.from_page === (m.sender_id === meId) &&
                  (x.content ?? null) === (m.content ?? null) &&
                  (x.image_url ?? null) === (m.image_url ?? null) &&
                  (x.audio_url ?? null) === (m.audio_url ?? null)
                );
                if (idx >= 0) { const copy = prev.slice(); copy[idx] = { ...m, from_page: m.sender_id === meId }; return copy; }
                return [...prev, { ...m, from_page: m.sender_id === meId }];
              });
              if (m.sender_id !== meId) {
                supabase.from("messages").update({ seen: true } as any).eq("id", m.id).then();
              }
            }
          }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
          const m = payload.new as any;
          if (m && !m.group_id) {
            const isMatch = (m.sender_id === meId && m.receiver_id === conv.userId) ||
              (m.sender_id === conv.userId && m.receiver_id === meId);
            if (isMatch) {
              setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m, from_page: m.sender_id === meId } : x)));
            }
          }
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
          const m = payload.old as any;
          if (m) {
            setMessages((prev) => prev.filter((x) => x.id !== m.id));
          }
        })
        .subscribe();
      return () => { supabase.removeChannel(teamChannel); };
    }

    const msgChannel = supabase
      .channel(`admin-active-page-chat-global-${rand}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "page_messages" }, (payload) => {
        const m = payload.new as PageMsg;
        const currentConvId = activeIdRef.current;

        if (m.conversation_id === currentConvId) {
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
            setCachedPageMessages(`admin-page-${currentConvId}`, next);
            return next;
          });
          if (!m.from_page) {
            supabase.from("page_messages").update({ seen: true }).eq("id", m.id).then();
          }
        } else {
          // Update other page conversations' cache in memory
          const cacheKey = `admin-page-${m.conversation_id}`;
          const cached = getCachedPageMessages(cacheKey);
          if (cached && !cached.some(x => x.id === m.id)) {
            setCachedPageMessages(cacheKey, [...cached, m]);
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "page_messages" }, (payload) => {
        const m = payload.new as PageMsg;
        const currentConvId = activeIdRef.current;

        if (m.conversation_id === currentConvId) {
          setMessages((prev) => {
            const next = prev.map((x) => (x.id === m.id ? m : x));
            setCachedPageMessages(`admin-page-${currentConvId}`, next);
            return next;
          });
        } else {
          const cacheKey = `admin-page-${m.conversation_id}`;
          const cached = getCachedPageMessages(cacheKey);
          if (cached) {
            setCachedPageMessages(cacheKey, cached.map(x => x.id === m.id ? m : x));
          }
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "page_messages" }, (payload) => {
        const m = payload.old as PageMsg;
        const currentConvId = activeIdRef.current;

        if (m.conversation_id === currentConvId) {
          setMessages((prev) => {
            const next = prev.filter((x) => x.id !== m.id);
            setCachedPageMessages(`admin-page-${currentConvId}`, next);
            return next;
          });
        } else {
          const cacheKey = `admin-page-${m.conversation_id}`;
          const cached = getCachedPageMessages(cacheKey);
          if (cached) {
            setCachedPageMessages(cacheKey, cached.filter(x => x.id !== m.id));
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (payload) => {
        const row = (payload.new ?? payload.old) as CallRow;
        if (!row || row.status === "ringing" || row.status === "active") return;
        if (row.page_conversation_id !== activeIdRef.current) return;

        setCalls((prev) => {
          const exists = prev.some((c) => c.id === row.id);
          if (exists) return prev.map((c) => (c.id === row.id ? row : c));
          return [...prev, row];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(msgChannel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.conversationId]);

  const lastMsgCountRef = useRef(0);
  const lastConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevCount = lastMsgCountRef.current;
    lastMsgCountRef.current = messages.length;

    if (conv.conversationId !== lastConvIdRef.current) {
      // Switched chat. Scroll to bottom instantly
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        // Schedule microtask to guarantee bottom placement after layout reflow
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      }
      lastConvIdRef.current = conv.conversationId;
      isInitialLoadRef.current = false;
    } else if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const isMine = lastMsg && lastMsg.from_page;
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
  }, [messages, calls, conv.conversationId]);

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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
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

      if (m.content?.startsWith("[system:group_created]")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemGroupCreated: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_left:")) {
        const leftName = m.content.slice(18, -1);
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserLeft: true,
          systemLeftName: leftName,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_joined:")) {
        const joinedName = m.content.slice(20, -1);
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserJoined: true,
          systemJoinedName: joinedName,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:ownership_transferred:")) {
        const targetName = m.content.slice(30, -1);
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemOwnershipTransferred: true,
          systemOwnershipTarget: targetName,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:group_name_changed:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemGroupNameChanged: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:group_avatar_changed:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemGroupAvatarChanged: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_removed:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserRemoved: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_promoted:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserPromoted: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_added:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserAdded: true,
        } as any);
        continue;
      }

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
    if (isGroup) {
      const { data, error } = await supabase.from("messages").insert({
        group_id: groupId,
        sender_id: meId,
        content: reactionContent,
        seen: true,
      } as any).select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)").single();
      if (error) {
        toast.error("Failed to update reaction");
      } else if (data) {
        setMessages(prev => [...prev, { ...data, from_page: true } as any]);
      }
      return;
    }
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
    if (isGroup) {
      const { data, error } = await supabase.from("messages").insert({
        group_id: groupId,
        sender_id: meId,
        content: pinContent,
        seen: true,
      } as any).select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)").single();
      if (error) {
        toast.error("Failed to pin message");
      } else if (data) {
        setMessages(prev => [...prev, { ...data, from_page: true } as any]);
        toast.success("Message pinned");
      }
      return;
    }
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
    if (isGroup) {
      const { data, error } = await supabase.from("messages").insert({
        group_id: groupId,
        sender_id: meId,
        content: unpinContent,
        seen: true,
      } as any).select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)").single();
      if (error) {
        toast.error("Failed to unpin message");
      } else if (data) {
        setMessages(prev => [...prev, { ...data, from_page: true } as any]);
        toast.success("Message unpinned");
      }
      return;
    }
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

    if (editingMessageId) {
      const msgId = editingMessageId;
      setEditingMessageId(null);
      if (isGroup) {
        const { data, error } = await supabase
          .from("messages")
          .update({ content, is_edited: true })
          .eq("id", msgId)
          .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)")
          .single();
        if (error) {
          toast.error("Failed to edit message");
          console.error(error);
          return;
        }
        if (data) {
          setMessages((prev) => prev.map((x) => (x.id === msgId ? ({ ...data, from_page: true } as any) : x)));
        }
      } else {
        if (isTeamChat) {
          const { data, error } = await supabase
            .from("messages")
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
            setMessages((prev) => prev.map((x) => (x.id === msgId ? ({ ...data, from_page: true } as any) : x)));
          }
        } else {
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
            setMessages((prev) => {
              const next = prev.map((x) => (x.id === msgId ? (data as PageMsg) : x));
              setCachedPageMessages(`admin-page-${conv.conversationId}`, next);
              return next;
            });
          }
        }
      }
      return;
    }

    const replyPrefix = replyingTo
      ? `[reply:${replyingTo.id}:${replyingTo.from_page ? "You" : (conv?.username || "User")}:${replyingTo.content ? replyingTo.content.slice(0, 30) : replyingTo.image_url ? "Image 📷" : replyingTo.audio_url ? "Voice message 🎙️" : "Message"}] `
      : "";
    const finalContent = replyPrefix + content;
    setReplyingTo(null);

    const tempId = addOptimistic({ content });
    onLastMessageUpdate(content, null, null, new Date().toISOString());

    if (isGroup) {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          group_id: groupId,
          sender_id: meId,
          content: finalContent
        })
        .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)")
        .single();
      if (error) {
        setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
        toast.error(error.message);
        return;
      }
      if (data) {
        setMessages((prev) => prev.map((x) => (x.id === tempId ? ({ ...data, from_page: true } as any) : x)));
      }
      return;
    }

    if (isTeamChat) {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          sender_id: meId,
          receiver_id: conv.userId,
          content: finalContent
        })
        .select()
        .single();
      if (error) {
        setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
        toast.error(error.message);
        return;
      }
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? ({ ...data, from_page: true } as any) : x)));
      return;
    }

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
    onLastMessageUpdate(null, localPreview, null, new Date().toISOString());
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("chat-images", meId, file, ext, file.type);
      if (isGroup) {
        const { data, error } = await supabase
          .from("messages")
          .insert({ group_id: groupId, sender_id: meId, content: null, image_url: url } as any)
          .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)")
          .single();
        if (error) throw error;
        if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? ({ ...data, from_page: true } as any) : x)));
        setUploading(false);
        return;
      }
      if (isTeamChat) {
        const { data, error } = await supabase
          .from("messages")
          .insert({ sender_id: meId, receiver_id: conv.userId, content: null, image_url: url } as any)
          .select()
          .single();
        if (error) throw error;
        if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? ({ ...data, from_page: true } as any) : x)));
        setUploading(false);
        return;
      }
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
    onLastMessageUpdate(null, null, localPreview, new Date().toISOString());
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("chat-audio", meId, blob, ext, mime);
      if (isGroup) {
        const { data, error } = await supabase
          .from("messages")
          .insert({ group_id: groupId, sender_id: meId, content: null, audio_url: url } as any)
          .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)")
          .single();
        if (error) throw error;
        if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? ({ ...data, from_page: true } as any) : x)));
        setRecUploading(false);
        return;
      }
      if (isTeamChat) {
        const { data, error } = await supabase
          .from("messages")
          .insert({ sender_id: meId, receiver_id: conv.userId, content: null, audio_url: url } as any)
          .select()
          .single();
        if (error) throw error;
        if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? ({ ...data, from_page: true } as any) : x)));
        setRecUploading(false);
        return;
      }
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
        <div className="px-3 sm:px-5 py-3 border-b border-border bg-card flex items-center justify-between min-h-[61px] shrink-0">
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
        <div className="px-3 sm:px-5 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
          <button onClick={onBack} className="sm:hidden h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary -ml-1" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            onClick={onOpenDetail}
            className="flex-1 min-w-0 flex items-center gap-3 -mx-1 px-1 py-1 rounded-lg hover:bg-secondary text-left cursor-pointer transition-colors"
            aria-label="Open user details"
          >
            <Avatar name={conv.username} url={conv.avatar_url} size={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                  <span>{conv.username}</span>
                  {conv.vip_status && conv.vip_status !== "none" && (
                    <img 
                      src={getVipBadgeUrl(conv.vip_status) || undefined} 
                      alt={`${conv.vip_status} VIP`} 
                      className="h-5 w-auto object-contain select-none shrink-0"
                      title={`${conv.vip_status.toUpperCase()} VIP`}
                    />
                  )}
                  {conv.isAdmin && (
                    <Shield className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10 shrink-0" title="Admin User" />
                  )}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadWalletDetails(conv.userId);
                    setWalletPopupOpen(true);
                  }}
                  className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-bold transition-colors cursor-pointer"
                >
                  Bal: ${(conv.wallet || 0).toFixed(2)}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadWalletDetails(conv.userId);
                    setWalletPopupOpen(true);
                  }}
                  className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 font-bold transition-colors cursor-pointer"
                >
                  Credit: ${(conv.credit || 0).toFixed(2)}
                </button>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {isGroup ? (
                  typingUsers.size > 0 ? (
                    <span className="text-primary font-medium animate-pulse">
                      {Array.from(typingUsers).join(", ")} {typingUsers.size === 1 ? "is" : "are"} typing...
                    </span>
                  ) : (
                    "Group Chat"
                  )
                ) : (
                  conv.online ? "Active now" : `Last seen ${formatDistanceToNow(new Date(conv.last_seen), { addSuffix: true })}`
                )}
              </p>
            </div>
          </button>
          {!isGroup && !isTeamChat && <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary hidden md:inline">Replying as page</span>}
          {!isGroup && (
            <>
              <button
                type="button"
                onClick={() => startCall({ calleeId: conv.userId, kind: "voice", peer: { name: conv.username, avatar: conv.avatar_url }, context: isTeamChat ? "friend" : "page", ...(isTeamChat ? {} : { pageConversationId: conv.conversationId }) })}
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-primary/10"
                aria-label="Voice call"
                title="Voice call"
              >
                <Phone className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => startCall({ calleeId: conv.userId, kind: "video", peer: { name: conv.username, avatar: conv.avatar_url }, context: isTeamChat ? "friend" : "page", ...(isTeamChat ? {} : { pageConversationId: conv.conversationId }) })}
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-primary/10"
                aria-label="Video call"
                title="Video call"
              >
                <Video className="h-5 w-5" />
              </button>
            </>
          )}
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
                      onCallBack={() => startCall({ calleeId: conv.userId, kind: c.call_type, peer: { name: conv.username, avatar: conv.avatar_url }, context: isTeamChat ? "friend" : "page", ...(isTeamChat ? {} : { pageConversationId: conv.conversationId }) })}
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
                onMentionClick={handleMentionClick}
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

      {editingMessageId && (() => {
        const editingMsg = messages.find(x => x.id === editingMessageId);
        return (
          <div className="px-4 py-2 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground reply-preview-enter animate-in slide-in-from-bottom-2 duration-200">
            <div className="truncate flex-1">
              <span className="font-bold text-primary block text-[10px] uppercase">Editing Message</span>
              <span className="truncate block italic">{editingMsg?.content || ""}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMessageId(null);
                setText("");
              }}
              className="h-6 w-6 rounded-full hover:bg-secondary flex items-center justify-center ml-2 shrink-0"
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
            className="w-full max-w-md py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-bold rounded-xl text-sm transition-colors text-center shadow-md"
          >
            Delete ({selectedMsgs.size})
          </button>
        </div>
      ) : (
        <form
          onSubmit={send}
          className="relative px-4 py-3 border-t border-border bg-card flex items-center gap-2 shrink-0"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
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
            className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50 transition-colors" aria-label="Send image">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
          <VoiceRecorder onRecorded={onVoice} uploading={recUploading} />
          {!isTeamChat && conv.userId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary transition-colors"
                  aria-label="Wallet menu"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 bg-card border-border">
                <DropdownMenuItem
                  onClick={() => {
                    loadWalletDetails(conv.userId);
                    setWalletPopupOpen(true);
                  }}
                  className="cursor-pointer gap-2 py-2 font-semibold"
                >
                  <Wallet className="h-4 w-4 text-green-500" />
                  <span>Wallet</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    loadWalletHistory("all", conv.userId);
                    setWalletHistoryPopupOpen(true);
                  }}
                  className="cursor-pointer gap-2 py-2 font-semibold"
                >
                  <History className="h-4 w-4 text-amber-500" />
                  <span>Wallet History</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setCashAmount("");
                    setCashNotes("");
                    setCashInPopupOpen(true);
                  }}
                  className="cursor-pointer gap-2 py-2 font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  <PlusCircle className="h-4 w-4 text-emerald-500" />
                  <span>Cash In</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setCashAmount("");
                    setCashNotes("");
                    setCashOutPopupOpen(true);
                  }}
                  className="cursor-pointer gap-2 py-2 font-semibold text-red-600 dark:text-red-400"
                >
                  <MinusCircle className="h-4 w-4 text-red-500" />
                  <span>Cash Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {mentionSearch !== null && filteredMembers.length > 0 && (
            <div className="absolute left-3 right-3 bottom-full mb-2 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden z-30 max-h-48 overflow-y-auto backdrop-blur-md bg-opacity-95">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/50 flex items-center gap-1 border-b border-border">
                <span>Mention member</span>
              </div>
              {filteredMembers.map((member, i) => (
                <button
                  key={member.id}
                  type="button"
                  onMouseEnter={() => setMentionIdx(i)}
                  onClick={() => insertMention(member.username)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary ${i === mentionIdx ? "bg-secondary" : ""}`}
                >
                  <Avatar name={member.first_name && member.last_name ? `${member.first_name} ${member.last_name}` : member.username} url={member.avatar_url} size={24} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold">@{member.username}</span>
                    {member.first_name && (
                      <span className="text-[10px] text-muted-foreground truncate">{member.first_name} {member.last_name || ""}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          <Input
            ref={inputRef}
            autoFocus
            placeholder="Reply as Jackpot Jungle…"
            value={text}
            onChange={(e) => {
              const val = e.target.value;
              setText(val);
              setSuggestIdx(0);
              if (isGroup) {
                handleMentionCheck(val, e.target.selectionStart || 0);
              }
            }}
            onKeyDown={(e) => {
              console.log("onKeyDown event key:", e.key, "mentionSearch:", mentionSearch, "filteredMembers count:", filteredMembers.length);
              if (mentionSearch !== null && filteredMembers.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIdx((i) => (i + 1) % filteredMembers.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIdx((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(filteredMembers[mentionIdx].username);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionSearch(null);
                  return;
                }
              }
              if (suggestions.length === 0) return;
              if (e.key === "Tab" || (e.key === "Enter" && suggestions.length > 0 && text.length < suggestions[suggestIdx].content.length)) {
                e.preventDefault();
                applyReply(suggestions[suggestIdx]);
              } else if (e.key === "ArrowDown") { e.preventDefault(); setSuggestIdx((i) => (i + 1) % suggestions.length); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length); }
              else if (e.key === "Escape") { setSuggestIdx(0); }
            }}
            className="flex-1 min-w-0 rounded-full bg-secondary border-transparent h-11 focus-visible:ring-1 focus-visible:ring-primary/30" />
          <Button type="submit" size="icon" disabled={!text.trim()} className="rounded-full h-11 w-11 shrink-0 flex items-center justify-center send-btn-active bg-primary text-primary-foreground hover:bg-primary/95 transition-all">
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
                {mine && !m.image_url && !m.audio_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setText(m.content || "");
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
      {/* Delete Confirmation Dialog */}
      {showDeleteBottomSheet && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
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
                      if (isGroup || isTeamChat) {
                        await unsendMessagesServer({ data: { ids: targetIds } });
                      } else {
                        await unsendPageMessagesServer({ data: { ids: targetIds } });
                      }
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

      {/* Mention Options Dialog */}
      <Dialog open={mentionOptionsOpen} onOpenChange={setMentionOptionsOpen}>
        <DialogContent className="max-w-xs bg-card border border-border p-6 rounded-2xl shadow-2xl backdrop-blur-md">
          {selectedMentionProfile && (
            <div className="flex flex-col items-center text-center gap-4">
              <Avatar
                name={selectedMentionProfile.first_name && selectedMentionProfile.last_name
                  ? `${selectedMentionProfile.first_name} ${selectedMentionProfile.last_name}`
                  : selectedMentionProfile.username}
                url={selectedMentionProfile.avatar_url}
                size={80}
              />
              <div className="flex flex-col">
                <span className="font-bold text-foreground text-lg">
                  {selectedMentionProfile.first_name && selectedMentionProfile.last_name
                    ? `${selectedMentionProfile.first_name} ${selectedMentionProfile.last_name}`
                    : `@${selectedMentionProfile.username}`}
                </span>
                <span className="text-xs text-muted-foreground">@{selectedMentionProfile.username}</span>
              </div>
              <div className="w-full flex flex-col gap-2 mt-2">
                <button
                  onClick={() => {
                    setMentionOptionsOpen(false);
                    if (onUserClick) {
                      onUserClick(selectedMentionProfile.id);
                    }
                  }}
                  className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Message</span>
                </button>
                <button
                  onClick={() => {
                    setMentionOptionsOpen(false);
                    navigate({ to: "/app/u/$username", params: { username: selectedMentionProfile.username } });
                  }}
                  className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors border border-border/50"
                >
                  <UserIcon className="h-4 w-4 text-primary" />
                  <span>View profile</span>
                </button>
                {selectedMentionProfile.id !== meId && !isFriendOfMine && !friendRequestSent && (
                  <button
                    onClick={handleAddFriend}
                    className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors border border-border/50"
                  >
                    <UserPlus className="h-4 w-4 text-primary" />
                    <span>Add friend</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 1. Wallet Control Dialog */}
      <Dialog open={walletPopupOpen} onOpenChange={setWalletPopupOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground shadow-2xl rounded-2xl p-6 overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-primary">
              <Wallet className="h-6 w-6 text-green-500 animate-pulse" />
              <span>Wallet Control Panel</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Manage Available Balance and Credit Balance for customer <strong>{conv.username}</strong>.
            </DialogDescription>
          </DialogHeader>

          {loadingWalletDetails ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Fetching ledger details...</p>
            </div>
          ) : (
            <div className="space-y-6 my-4">
              {/* Financial Stats Display */}
              <div className="grid grid-cols-2 gap-3 bg-secondary/35 p-4 rounded-xl border border-border/40">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Available Balance</span>
                  <p className="text-xl font-black text-emerald-500">${Number(walletDetails?.wallet_balance ?? 0).toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Credit Balance</span>
                  <p className="text-xl font-black text-amber-500">${Number(walletDetails?.credit_balance ?? 0).toFixed(2)}</p>
                </div>
                <div className="col-span-2 border-t border-border/40 my-1"></div>
                <div className="space-y-0.5">
                  <span className="text-[9px] text-muted-foreground block">Total Deposited</span>
                  <span className="text-xs font-semibold">${Number(walletDetails?.wallet_deposits ?? 0).toFixed(2)}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] text-muted-foreground block">Total Released</span>
                  <span className="text-xs font-semibold">${Number(walletDetails?.wallet_released ?? 0).toFixed(2)}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] text-muted-foreground block">Total Used/Deducted</span>
                  <span className="text-xs font-semibold">${Number(walletDetails?.wallet_used ?? 0).toFixed(2)}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] text-muted-foreground block">Last Action Update</span>
                  <span className="text-[10px] font-medium text-muted-foreground truncate block">
                    {walletDetails?.wallet_last_updated ? new Date(walletDetails.wallet_last_updated).toLocaleDateString() : "Never"}
                  </span>
                </div>
              </div>

              {/* Perform Adjustment Form */}
              <div className="space-y-4 border-t border-border/50 pt-4">
                <h4 className="text-xs font-black uppercase text-muted-foreground tracking-wider">Perform Ledger Adjustment</h4>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">Action Type</label>
                  <select
                    value={walletAction}
                    onChange={(e) => setWalletAction(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-secondary text-sm border-border focus:ring-1 focus:ring-primary/40 focus:border-transparent font-medium"
                  >
                    <option value="deposit">Add Wallet Funds</option>
                    <option value="deduction">Played Wallet Funds</option>
                    <option value="credit_added">Load Credit</option>
                    <option value="deduct_credit">Paid Credit</option>
                  </select>
                </div>

                {(walletAction === "deposit" || walletAction === "deduct_credit") && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                    <label className="text-xs font-bold text-muted-foreground">Payment Method</label>
                    <select
                      value={walletPaymentMethod}
                      onChange={(e) => setWalletPaymentMethod(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-secondary text-sm border-border focus:ring-1 focus:ring-primary/40 focus:border-transparent font-medium"
                    >
                      <option value="Cashapp">Cashapp</option>
                      <option value="Chime">Chime</option>
                      <option value="Venmo">Venmo</option>
                      <option value="Paypal">Paypal</option>
                      <option value="Apple pay">Apple pay</option>
                      <option value="Stripe">Stripe</option>
                      <option value="Crypto">Crypto</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">Amount ($)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Enter amount (e.g. 50.00)"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    className="h-10 rounded-lg bg-secondary border-transparent text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">Internal Notes (Optional)</label>
                  <textarea
                    placeholder="Add optional notes visible to admins only..."
                    value={walletNotes}
                    onChange={(e) => setWalletNotes(e.target.value)}
                    rows={2}
                    className="w-full p-3 rounded-lg bg-secondary text-sm border-transparent focus:ring-1 focus:ring-primary/40 focus:border-transparent resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col gap-2 mt-4 sm:flex-row">
            {isSuperAdmin && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleResetWallet}
                disabled={performingWalletAction || loadingWalletDetails}
                className="w-full sm:w-auto shrink-0 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Wallet
              </Button>
            )}
            <div className="flex-1"></div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setWalletPopupOpen(false)}
              className="w-full sm:w-auto rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitWalletAction}
              disabled={performingWalletAction || loadingWalletDetails}
              className="w-full sm:w-auto rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90"
            >
              {performingWalletAction ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  Applying...
                </>
              ) : (
                "Apply Adjustment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash In Dialog */}
      <Dialog open={cashInPopupOpen} onOpenChange={setCashInPopupOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground shadow-2xl rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-emerald-500">
              <PlusCircle className="h-6 w-6" />
              <span>Cash In (Deposit)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Log a Cash In transaction record for customer <strong>{conv.username}</strong>. (Does not affect available or credit balances)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Amount ($)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter amount (e.g. 50.00)"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                className="h-10 rounded-lg bg-secondary border-transparent text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Internal Notes (Optional)</label>
              <textarea
                placeholder="Add optional notes..."
                value={cashNotes}
                onChange={(e) => setCashNotes(e.target.value)}
                rows={2}
                className="w-full p-3 rounded-lg bg-secondary text-sm border-transparent focus:ring-1 focus:ring-primary/40 focus:border-transparent resize-none"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCashInPopupOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitCashIn}
              disabled={performingCashAction}
              className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {performingCashAction ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  Saving...
                </>
              ) : (
                "Log Cash In"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Out Dialog */}
      <Dialog open={cashOutPopupOpen} onOpenChange={setCashOutPopupOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground shadow-2xl rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-red-500">
              <MinusCircle className="h-6 w-6" />
              <span>Cash Out (Wins)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Log a Cash Out transaction record for customer <strong>{conv.username}</strong>. (Does not affect available or credit balances)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Amount ($)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter amount (e.g. 50.00)"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                className="h-10 rounded-lg bg-secondary border-transparent text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Internal Notes (Optional)</label>
              <textarea
                placeholder="Add optional notes..."
                value={cashNotes}
                onChange={(e) => setCashNotes(e.target.value)}
                rows={2}
                className="w-full p-3 rounded-lg bg-secondary text-sm border-transparent focus:ring-1 focus:ring-primary/40 focus:border-transparent resize-none"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCashOutPopupOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitCashOut}
              disabled={performingCashAction}
              className="rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
            >
              {performingCashAction ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  Saving...
                </>
              ) : (
                "Log Cash Out"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Wallet History Dialog */}
      <Dialog open={walletHistoryPopupOpen} onOpenChange={setWalletHistoryPopupOpen}>
        <DialogContent className="max-w-4xl bg-card border border-border text-foreground shadow-2xl rounded-2xl p-6 overflow-hidden flex flex-col h-[85vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center justify-between text-xl font-bold text-primary">
              <div className="flex items-center gap-2">
                <History className="h-6 w-6 text-amber-500" />
                <span>Wallet Transaction Ledger</span>
              </div>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Review transactional history logs, export statements, and send notifications to customer <strong>{conv.username}</strong>.
            </DialogDescription>
          </DialogHeader>

          {/* Filtering and Export Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/20 p-3 rounded-xl border border-border/30 my-2 shrink-0">
            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">Filter:</span>
                <select
                  value={historyFilter}
                  onChange={(e) => {
                    setHistoryFilter(e.target.value);
                    loadWalletHistory(e.target.value, conv.userId, startDate, endDate);
                  }}
                  className="h-8 px-2 rounded bg-secondary text-xs border-border/50 font-medium"
                >
                  <option value="all">All Transactions</option>
                  <option value="wallet">Wallet Balance</option>
                  <option value="credit">Credit Balance</option>
                  <option value="cashin">Cash In</option>
                  <option value="cashout">Cash Out</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">Start:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    loadWalletHistory(historyFilter, conv.userId, e.target.value, endDate);
                  }}
                  className="h-8 px-2 rounded bg-secondary text-xs border border-border/50 font-medium text-foreground dark:text-foreground"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">End:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    loadWalletHistory(historyFilter, conv.userId, startDate, e.target.value);
                  }}
                  className="h-8 px-2 rounded bg-secondary text-xs border border-border/50 font-medium text-foreground dark:text-foreground"
                />
              </div>
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    loadWalletHistory(historyFilter, conv.userId, "", "");
                  }}
                  className="h-8 rounded-lg text-xs font-bold text-destructive hover:bg-destructive/10 gap-1"
                >
                  <X className="h-3.5 w-3.5" /> Clear Dates
                </Button>
              )}
            </div>

            {/* Export buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportAdminCSV}
                disabled={loadingHistory || loadingWalletDetails}
                className="h-8 rounded-lg text-xs gap-1.5 font-bold disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={printAdminStatement}
                disabled={loadingHistory || loadingWalletDetails}
                className="h-8 rounded-lg text-xs gap-1.5 font-bold disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Statement
              </Button>

              <Button
                size="sm"
                onClick={() => sendStatementToUser("chat")}
                disabled={loadingHistory || loadingWalletDetails}
                className="h-8 rounded-lg text-xs gap-1.5 font-bold bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50"
              >
                <Mail className="h-3.5 w-3.5" />
                Send to User
              </Button>
            </div>
          </div>

          {(() => {
            const cashInTotal = walletTransactions
              .filter(tx => tx.action === "cashin" && !tx.deleted)
              .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

            const cashOutTotal = walletTransactions
              .filter(tx => tx.action === "cashout" && !tx.deleted)
              .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

            const netCashFlow = cashInTotal - cashOutTotal;

            return (
              <>
                {/* Cash In / Cash Out Stats Banner */}
                <div className="grid grid-cols-3 gap-4 bg-secondary/15 p-4 rounded-xl border border-border/30 my-2 shrink-0 select-none">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Cash In</span>
                    <p className="text-lg font-black text-emerald-500">${cashInTotal.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Cash Out</span>
                    <p className="text-lg font-black text-red-500">${cashOutTotal.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1 border-l border-border/40 pl-4">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Net Cash Flow (In - Out)</span>
                    <p className={`text-lg font-black ${netCashFlow >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {netCashFlow >= 0 ? "+" : ""}${netCashFlow.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Ledger Table Container */}
                <div className="flex-1 overflow-y-auto border border-border/40 rounded-xl bg-card">
                  {loadingHistory ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-xs text-muted-foreground font-medium">Loading ledger statements...</p>
                    </div>
                  ) : walletTransactions.length === 0 ? (
                    <div className="text-center py-20">
                      <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm font-bold text-muted-foreground">No ledger transactions found</p>
                      <p className="text-xs text-muted-foreground/75 mt-1">Try changing the search filter or perform a new adjustment.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-secondary/40 sticky top-0 border-b border-border/50 text-[10px] text-muted-foreground uppercase tracking-wider font-bold shrink-0 z-10">
                        <tr>
                          <th className="p-3">Date & Time</th>
                          <th className="p-3">Action</th>
                          <th className="p-3 text-right">Amount</th>
                          <th className="p-3 text-right">Avail. Bal</th>
                          <th className="p-3 text-right">Credit Bal</th>
                          <th className="p-3">Reason</th>
                          <th className="p-3">Admin</th>
                          <th className="p-3 text-right">Controls</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {walletTransactions.map((tx) => {
                          const isCredit = tx.action.includes("credit");
                          const isPositive = ["deposit", "credit_added", "refund", "bonus", "cashin"].includes(tx.action);

                          return (
                            <tr 
                              key={tx.id} 
                              className={`hover:bg-secondary/20 transition-colors ${tx.deleted ? "opacity-45 line-through bg-secondary/10" : ""}`}
                            >
                              <td className="p-3 text-muted-foreground whitespace-nowrap">
                                {new Date(tx.created_at).toLocaleString()}
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider inline-block ${
                                  tx.deleted 
                                    ? "bg-muted text-muted-foreground"
                                    : tx.action === "deposit" || tx.action === "bonus" || tx.action === "refund" || tx.action === "cashin"
                                      ? "bg-emerald-500/10 text-emerald-500"
                                      : tx.action === "credit_added"
                                        ? "bg-amber-500/10 text-amber-500"
                                        : tx.action === "credit_released"
                                          ? "bg-blue-500/10 text-blue-500"
                                          : tx.action === "transfer"
                                            ? "bg-indigo-500/10 text-indigo-500"
                                            : tx.action === "reset"
                                              ? "bg-red-500/10 text-red-500"
                                              : "bg-red-500/15 text-red-500"
                                }`}>
                                  {tx.action.replace("_", " ")}
                                </span>
                              </td>
                              <td className={`p-3 text-right font-black whitespace-nowrap ${
                                tx.deleted ? "text-muted-foreground" : isPositive ? "text-emerald-500" : "text-destructive"
                              }`}>
                                {isPositive ? "+" : "-"}${Number(tx.amount).toFixed(2)}
                              </td>
                              <td className="p-3 text-right whitespace-nowrap font-medium">
                                <span className="text-[10px] text-muted-foreground block">
                                  ${Number(tx.avail_before).toFixed(2)} &rarr;
                                </span>
                                <span className="font-bold">${Number(tx.avail_after).toFixed(2)}</span>
                              </td>
                              <td className="p-3 text-right whitespace-nowrap font-medium">
                                <span className="text-[10px] text-muted-foreground block">
                                  ${Number(tx.credit_before).toFixed(2)} &rarr;
                                </span>
                                <span className="font-bold">${Number(tx.credit_after).toFixed(2)}</span>
                              </td>
                              <td className="p-3 font-semibold break-words max-w-xs">{tx.reason}</td>
                              <td className="p-3 text-muted-foreground whitespace-nowrap font-medium">
                                {tx.admin_name || "Admin"}
                              </td>
                              <td className="p-3 text-right whitespace-nowrap">
                                {!tx.deleted ? (
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditTx(tx)}
                                      className="p-1 hover:bg-secondary rounded text-primary transition-colors"
                                      title="Edit transaction"
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTx(tx.id)}
                                      className="p-1 hover:bg-destructive/10 rounded text-destructive transition-colors"
                                      title="Delete transaction"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">Deleted</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            );
          })()}

          <DialogFooter className="shrink-0 pt-4 border-t border-border/40 mt-2">
            <Button
              type="button"
              onClick={() => setWalletHistoryPopupOpen(false)}
              className="w-full sm:w-auto rounded-xl text-xs font-bold"
            >
              Close Ledger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Edit Transaction Dialog */}
      <Dialog open={editTxOpen} onOpenChange={setEditTxOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground shadow-2xl rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-primary">
              <Edit className="h-5 w-5 text-amber-500" />
              <span>Edit Wallet Transaction</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Correct transaction details. This will update the customer's balance accordingly.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 my-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Amount ($)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editTxAmount}
                onChange={(e) => setEditTxAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-10 px-3 rounded-lg bg-secondary text-sm"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Reason / Description</label>
              <Input
                type="text"
                value={editTxReason}
                onChange={(e) => setEditTxReason(e.target.value)}
                placeholder="Reason"
                className="w-full h-10 px-3 rounded-lg bg-secondary text-sm"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Date & Time</label>
              <input
                type="datetime-local"
                value={editTxCreatedAt}
                onChange={(e) => setEditTxCreatedAt(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-secondary text-sm border border-border/50 text-foreground dark:text-foreground"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Internal Notes (Optional)</label>
              <Input
                type="text"
                value={editTxNotes}
                onChange={(e) => setEditTxNotes(e.target.value)}
                placeholder="Notes visible to admins only..."
                className="w-full h-10 px-3 rounded-lg bg-secondary text-sm"
              />
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditTxOpen(false)}
              className="w-full sm:w-auto rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitEditTx}
              className="w-full sm:w-auto rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Delete Transaction Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-card border border-border text-foreground rounded-2xl max-w-sm p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-destructive">
              Confirm Transaction Deletion
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground mt-2">
              Are you sure you want to delete this transaction? This will revert its effect on the user's balance. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel 
              className="rounded-xl text-xs font-bold"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setDeleteConfirmTxId(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl text-xs font-bold"
              onClick={confirmDeleteTx}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  try {
    const { getWalletHistoryAdmin } = await import("@/lib/wallet.functions");
    const txs = await getWalletHistoryAdmin({
      data: {
        targetUserId: userId,
        filter,
        startDate,
        endDate,
      }
    });

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) throw new Error("Customer profile not found");

    const customerName = profile.first_name
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : profile.username;

    let tableHeaders = "";
    let colspan = 9;
    if (filter === "wallet") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Avail. Before</th>
        <th style="text-align: right;">Avail. After</th>
        <th>Reason</th>
        <th>Admin</th>
      `;
      colspan = 7;
    } else if (filter === "credit") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Credit Before</th>
        <th style="text-align: right;">Credit After</th>
        <th>Reason</th>
        <th>Admin</th>
      `;
      colspan = 7;
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
        <th>Admin</th>
      `;
      colspan = 9;
    }

    const txRows = txs.map((tx: any) => {
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
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.admin_name || "Admin"}</td>
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
            <p style="margin: 4px 0 0 0; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Ledger statement</p>
          </div>
          <div>
            <h3 style="margin: 0;">Customer Name: ${customerName}</h3>
            <p style="margin: 4px 0; font-size: 13px;">Customer ID: ${userId}</p>
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
  } catch (err: any) {
    printWindow.close();
    toast.error(err.message || "Failed to generate print statement");
  }
};

function renderContentWithMentions(
  content: string,
  onMentionClick: (username: string) => void,
  isMatch: boolean,
  highlight: (text: string, q: string) => React.ReactNode,
  searchQuery: string,
  isMine: boolean
) {
  if (!content) return "";
  const parts = content.split(/(\s+)/);
  return parts.map((part, index) => {
    if (part.startsWith("@") && part.length > 1) {
      const match = part.match(/^@([a-zA-Z0-9_\-]+)(.*)$/);
      if (match) {
        const [_, username, punctuation] = match;
        return (
          <React.Fragment key={index}>
            <button
              type="button"
              onClick={(e) => {
                console.log("Mention HTML button clicked directly! username:", username);
                e.preventDefault();
                e.stopPropagation();
                onMentionClick(username);
              }}
              className={`hover:underline font-bold focus:outline-none ${
                isMine
                  ? "text-white underline decoration-dashed decoration-white/50"
                  : "text-primary font-semibold"
              }`}
            >
              @{username}
            </button>
            {punctuation}
          </React.Fragment>
        );
      }
    }
    return isMatch ? highlight(part, searchQuery) : part;
  });
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
  onMentionClick: (username: string) => void;
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
  onMentionClick,
}: AdminConversationMessageItemProps) {
  const mine = m.from_page;
  const isStatement = m.content?.startsWith("📄 JACKPOT JUNGLE STATEMENT");
  const [showSelfTime, setShowSelfTime] = useState(false);
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

  const senderUsername = m.sender?.username || "Someone";
  const senderDispName = m.sender
    ? (m.sender.first_name && m.sender.last_name ? `${m.sender.first_name} ${m.sender.last_name}` : `@${m.sender.username}`)
    : (mine ? "You" : "Someone");

  if (m.isSystemGroupCreated) {
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {mine ? "You created the group." : `${senderDispName} created the group.`}
      </div>
    );
  }
  if (m.isSystemUserLeft) {
    const leftName = m.systemLeftName || senderDispName;
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {leftName} left the group
      </div>
    );
  }
  if (m.isSystemUserJoined) {
    const joinedName = m.systemJoinedName || senderDispName;
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {joinedName} joined the group
      </div>
    );
  }
  if (m.isSystemOwnershipTransferred) {
    const targetName = m.systemOwnershipTarget || "Someone";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {targetName} became the group administrator
      </div>
    );
  }
  if (m.isSystemGroupNameChanged) {
    const parts = m.content?.split(":") || [];
    const newName = parts[2] || "";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} renamed the group to "{newName}"
      </div>
    );
  }
  if (m.isSystemGroupAvatarChanged) {
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} updated the group photo
      </div>
    );
  }
  if (m.isSystemUserRemoved) {
    const parts = m.content?.split(":") || [];
    const targetUser = parts[2] || "";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} removed @{targetUser} from the group
      </div>
    );
  }
  if (m.isSystemUserPromoted) {
    const parts = m.content?.split(":") || [];
    const targetUser = parts[2] || "";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} promoted @{targetUser} to admin
      </div>
    );
  }
  if (m.isSystemUserAdded) {
    const parts = m.content?.split(":") || [];
    const targetUser = parts[2] || "";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} added @{targetUser} to the group
      </div>
    );
  }

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

        {/* Sender Header for Group Chats */}
        {!mine && m.sender && (
          <div className="flex items-center gap-1.5 ml-2 mb-1 select-none">
            <Avatar name={m.sender.first_name && m.sender.last_name ? `${m.sender.first_name} ${m.sender.last_name}` : m.sender.username} url={m.sender.avatar_url} size={20} />
            <span className="text-[10px] font-bold text-muted-foreground">
              {m.sender.first_name && m.sender.last_name ? `${m.sender.first_name} ${m.sender.last_name}` : `@${m.sender.username}`}
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
            onClick={() => {
              if (!selectionMode) {
                setShowSelfTime(!showSelfTime);
              }
            }}
          >
            {m.image_url ? (
              <button onClick={() => onPreviewImage(toCDNUrl(m.image_url))} className="max-w-[200px] rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary block select-none">
                <img src={toCDNUrl(m.image_url)} alt="" className="block max-h-72 w-auto object-cover" />
              </button>
            ) : m.audio_url ? (
              <div className="block"><VoiceMessage src={toCDNUrl(m.audio_url)} mine={mine} /></div>
            ) : isStatement ? (
              <div
                onClick={async (e) => {
                  e.stopPropagation();
                  await printStatementFromMessage(m.content || "", conv.userId);
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
              <div className={`max-w-[240px] rounded-2xl px-4 py-2 text-sm select-none cursor-pointer ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"} ${isActiveMatch ? "ring-2 ring-primary" : ""}`}>
                <p className="text-[14px] whitespace-pre-wrap break-words leading-relaxed">
                  {m.content ? renderContentWithMentions(m.content, onMentionClick, isMatch, highlight, searchQuery.trim(), mine) : ""}
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
                {conv.isGroup ? (
                  <span className="text-[9px] text-muted-foreground/60 italic">Read by group</span>
                ) : (
                  <>
                    {conv.avatar_url ? <img src={conv.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full object-cover ring-1 ring-border" /> : <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />}
                    Seen
                  </>
                )}
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

