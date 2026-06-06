import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, type AppRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar } from "@/components/messenger/Avatar";
import {
  Search,
  Send,
  Shield,
  Inbox,
  Users as UsersIcon,
  ChevronLeft,
  Trash2,
  Plus,
  ArrowLeft,
  Menu,
  X,
  
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
} from "lucide-react";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
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

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — Jackpot Jungle Messenger" }] }),
  component: AdminPage,
});

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
};

function AdminPage() {
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin, loading } = useRole();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("inbox");
  const [navOpen, setNavOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/chat", replace: true });
  }, [loading, isAdmin, navigate]);

  async function signOut() {
    await supabase
      .from("profiles")
      .update({ online: false, last_seen: new Date().toISOString() })
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading || !isAdmin || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
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
          className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        <p className="px-3 pt-1 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Business</p>
        <SideBtn active={tab === "inbox"} onClick={() => { setTab("inbox"); setNavOpen(false); }} icon={Inbox} label="Page Inbox" />
        <SideBtn active={tab === "quickreplies"} onClick={() => { setTab("quickreplies"); setNavOpen(false); }} icon={MessageSquareQuote} label="Quick Replies" />
        <SideBtn active={tab === "tags"} onClick={() => { setTab("tags"); setNavOpen(false); }} icon={TagIcon} label="Tags" />
        <SideBtn active={tab === "broadcasts"} onClick={() => { setTab("broadcasts"); setNavOpen(false); }} icon={Megaphone} label="Broadcasts" />
        <SideBtn active={tab === "followups"} onClick={() => { setTab("followups"); setNavOpen(false); }} icon={Bell} label="Follow-ups" />
        <SideBtn active={tab === "autoresp"} onClick={() => { setTab("autoresp"); setNavOpen(false); }} icon={Bot} label="Auto-response" />
        <SideBtn active={tab === "referrals"} onClick={() => { setTab("referrals"); setNavOpen(false); }} icon={Gift} label="Referrals" />
        <SideBtn active={tab === "logs"} onClick={() => { setTab("logs"); setNavOpen(false); }} icon={Activity} label="Logs" />
        {isSuperAdmin && (
          <>
            <p className="px-3 pt-4 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Super admin</p>
            <SideBtn active={tab === "admins"} onClick={() => { setTab("admins"); setNavOpen(false); }} icon={UsersIcon} label="Admin team" />
            <SideBtn active={tab === "super"} onClick={() => { setTab("super"); setNavOpen(false); }} icon={SettingsIcon} label="System settings" />
          </>
        )}
        <p className="px-3 pt-4 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">My account</p>
        <SideBtn active={tab === "profile"} onClick={() => { setTab("profile"); setNavOpen(false); }} icon={UserIcon} label="My profile" />
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
      {/* Desktop side nav */}
      <div className="hidden md:flex">{SideNav}</div>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setNavOpen(false)} />
          <div className="relative z-10">{SideNav}</div>
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

      <AlertDialog open={confirmOut} onOpenChange={setConfirmOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>You really wanna sign out of Jackpot Jungle?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={signOut} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScrollWrap({ onOpenNav, title, children }: { onOpenNav: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="md:hidden sticky top-0 z-10 bg-card border-b border-border px-3 py-3 flex items-center gap-2 shrink-0">
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [userTagMap, setUserTagMap] = useState<Record<string, string[]>>({});
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  async function load() {
    const { data: convList } = await supabase
      .from("page_conversations")
      .select("id, user_id, last_message_at")
      .order("last_message_at", { ascending: false });
    if (!convList) return;
    const userIds = convList.map((c) => c.user_id);
    const convIds = convList.map((c) => c.id);
    if (userIds.length === 0) { setConvs([]); return; }

    const [{ data: profiles }, { data: msgs }, { data: tagsData }, { data: utRows }, { data: credRows }] = await Promise.all([
      supabase.from("profiles").select("id, username, avatar_url, online, last_seen").in("id", userIds),
      supabase
        .from("page_messages")
        .select("conversation_id, content, created_at, seen, from_page")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false }),
      supabase.from("tags").select("id, name, color").order("name"),
      supabase.from("user_tags").select("user_id, tag_id").in("user_id", userIds),
      supabase.from("user_credits").select("user_id, balance").in("user_id", userIds),
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
      const last = convMsgs[0];
      const unread = convMsgs.filter((m) => !m.from_page && !m.seen).length;
      return {
        conversationId: c.id,
        userId: c.user_id,
        username: p?.username ?? "(unknown)",
        avatar_url: p?.avatar_url ?? null,
        online: p?.online ?? false,
        last_seen: p?.last_seen ?? c.last_message_at,
        lastMessage: last?.content ?? null,
        lastAt: last?.created_at ?? null,
        unread,
        credit: creditMap.get(c.user_id) ?? 0,
      };
    });
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
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  const filtered = convs.filter((u) => {
    if (search && !u.username.toLowerCase().includes(search.toLowerCase())) return false;
    if (tagFilter && !(userTagMap[u.userId] ?? []).includes(tagFilter)) return false;
    return true;
  });
  const active = convs.find((u) => u.conversationId === activeId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      {/* List — hidden on mobile when a conversation is open */}
      <div className={`${active ? "hidden sm:flex" : "flex"} w-full sm:w-80 border-r border-border bg-card flex-col min-h-0`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3 sm:mb-1">
            <button
              onClick={onOpenNav}
              className="md:hidden h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary"
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
          {allTags.length > 0 && (
            <div className="flex gap-1.5 mt-3 overflow-x-auto -mx-1 px-1 pb-1">
              <button
                onClick={() => setTagFilter(null)}
                className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border ${tagFilter === null ? "bg-primary text-primary-foreground border-transparent" : "bg-secondary border-transparent text-muted-foreground"}`}
              >
                All
              </button>
              {allTags.map((t) => {
                const on = tagFilter === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTagFilter(on ? null : t.id)}
                    className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold border ${on ? "border-transparent text-white" : "border-border text-muted-foreground"}`}
                    style={on ? { background: t.color } : {}}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No conversations.</p>
          ) : filtered.map((u) => (
            <button
              key={u.conversationId}
              onClick={() => setActiveId(u.conversationId)}
              className={`w-full flex items-center gap-3 px-3 py-3 mx-2 my-1 rounded-xl text-left hover:bg-secondary transition-colors ${activeId === u.conversationId ? "bg-secondary" : ""}`}
            >
              <div className="relative shrink-0">
                <Avatar name={u.username} url={u.avatar_url} size={44} />
                {u.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate text-sm ${u.unread ? "font-bold" : "font-semibold"}`}>{u.username}</p>
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
          ))}
        </div>
      </div>

      {/* Conversation pane — full screen on mobile when open */}
      <div className={`${active ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col bg-background min-h-0`}>
        {active ? (
          <Conversation meId={meId} conv={active} onBack={() => setActiveId(null)} onOpenDetail={() => setDetailOpen(true)} />
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
          {active && <UserDetailPanel userId={active.userId} username={active.username} avatar={active.avatar_url} variant="embedded" />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type PageMsg = { id: string; sender_id: string; content: string | null; image_url: string | null; audio_url: string | null; created_at: string; seen: boolean; from_page: boolean };

function Conversation({ meId, conv, onBack, onOpenDetail }: { meId: string; conv: ConvRow; onBack: () => void; onOpenDetail: () => void }) {
  const [messages, setMessages] = useState<PageMsg[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recUploading, setRecUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [quickReplies, setQuickReplies] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("quick_replies").select("id, title, content").then(({ data }) => setQuickReplies(data ?? []));
  }, []);

  const trimmed = text.trim().toLowerCase();
  const suggestions = trimmed && !text.includes("\n")
    ? quickReplies.filter((q) => q.title.toLowerCase().includes(trimmed)).slice(0, 5)
    : [];

  function applyReply(q: { content: string }) {
    setText(q.content);
    setSuggestIdx(0);
  }

  async function load() {
    const { data } = await supabase
      .from("page_messages")
      .select("id, sender_id, content, image_url, audio_url, created_at, seen, from_page")
      .eq("conversation_id", conv.conversationId)
      .order("created_at", { ascending: true });
    setMessages((data as PageMsg[]) ?? []);
    await supabase.from("page_messages").update({ seen: true })
      .eq("conversation_id", conv.conversationId).eq("from_page", false).eq("seen", false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`admin-page-conv-${conv.conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "page_messages", filter: `conversation_id=eq.${conv.conversationId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.conversationId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase.from("page_messages").insert({
      conversation_id: conv.conversationId, sender_id: meId, from_page: true, content,
    });
    if (error) toast.error(error.message);
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Max 8 MB"); return; }
    setUploading(true);
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const url = await uploadAndSign("chat-images", meId, file, ext, file.type);
      const { error } = await supabase.from("page_messages").insert({
        conversation_id: conv.conversationId, sender_id: meId, from_page: true, content: null, image_url: url,
      } as any);
      if (error) toast.error(error.message);
    } catch (err: any) { toast.error(err?.message ?? "Upload failed"); }
    setUploading(false);
  }

  async function onVoice(blob: Blob, mime: string, ext: string) {
    setRecUploading(true);
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("chat-audio", meId, blob, ext, mime);
      const { error } = await supabase.from("page_messages").insert({
        conversation_id: conv.conversationId, sender_id: meId, from_page: true, content: null, audio_url: url,
      } as any);
      if (error) toast.error(error.message);
    } catch (err: any) { toast.error(err?.message ?? "Voice upload failed"); }
    setRecUploading(false);
  }

  return (
    <>
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
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">No messages yet.</p>
        ) : messages.map((m) => {
          const mine = m.from_page;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              {m.image_url ? (
                <button onClick={() => setPreview(m.image_url)} className="max-w-[70%] rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary">
                  <img src={m.image_url} alt="" className="block max-h-72 w-auto object-cover" />
                </button>
              ) : m.audio_url ? (
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl ${mine ? "bg-bubble-me" : "bg-bubble-them"}`}>
                  <audio controls src={m.audio_url} className="h-10 max-w-[260px]" />
                </div>
              ) : (
                <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"}`}>
                  {m.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
          className="rounded-full bg-secondary border-transparent h-11" />
        <Button type="submit" size="icon" disabled={!text.trim()} className="rounded-full h-11 w-11 shrink-0">
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

  async function revoke(row: AdminRow) {
    if (!confirm(`Revoke ${row.role} from ${row.username}?`)) return;
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
      <div className="md:hidden sticky top-0 z-10 bg-card border-b border-border px-3 py-3 flex items-center gap-2">
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
                  onClick={() => revoke(r)}
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
