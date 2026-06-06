import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, type AppRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar } from "@/routes/_authenticated/chat";
import {
  Search,
  Send,
  Shield,
  Inbox,
  Users as UsersIcon,
  LogOut,
  ChevronLeft,
  Trash2,
  Plus,
  ArrowLeft,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — Jackpot Jungle Messenger" }] }),
  component: AdminPage,
});

type Tab = "inbox" | "admins";

type UserRow = {
  id: string;
  username: string;
  email?: string | null;
  avatar_url: string | null;
  online: boolean;
  last_seen: string;
  lastMessage?: string | null;
  lastAt?: string | null;
  unread?: number;
};

function AdminPage() {
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin, loading } = useRole();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("inbox");

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/chat", replace: true });
  }, [loading, isAdmin, navigate]);

  if (loading || !isAdmin || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-16 md:w-56 border-r border-border bg-card flex flex-col">
        <div className="px-4 py-5 flex items-center gap-2 border-b border-border">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="hidden md:block">
            <p className="font-bold text-sm leading-tight">JJ Business</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {isSuperAdmin ? "Super Admin" : "Admin"}
            </p>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1">
          <SideBtn active={tab === "inbox"} onClick={() => setTab("inbox")} icon={Inbox} label="Inbox" />
          {isSuperAdmin && (
            <SideBtn active={tab === "admins"} onClick={() => setTab("admins")} icon={UsersIcon} label="Admins" />
          )}
        </nav>
        <div className="px-2 py-3 border-t border-border flex md:flex-row flex-col items-center gap-2">
          <button
            onClick={() => navigate({ to: "/chat" })}
            className="w-full h-10 rounded-lg flex items-center gap-2 px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Back to messenger"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">Messenger</span>
          </button>
          <ThemeToggle />
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {tab === "inbox" ? <InboxView meId={user.id} /> : <AdminsView />}
      </main>
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
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

/* ---------------- INBOX (Meta Business Suite style) ---------------- */

function InboxView({ meId }: { meId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  async function load() {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, online, last_seen")
      .neq("id", meId)
      .order("last_seen", { ascending: false });
    if (!profiles) return;
    const ids = profiles.map((p) => p.id);
    const { data: msgs } = await supabase
      .from("messages")
      .select("sender_id, receiver_id, content, created_at, seen")
      .or(`sender_id.eq.${meId},receiver_id.eq.${meId}`)
      .order("created_at", { ascending: false })
      .limit(500);
    const map: Record<string, UserRow> = {};
    profiles.forEach((p) => { map[p.id] = { ...p, lastMessage: null, lastAt: null, unread: 0 }; });
    (msgs ?? []).forEach((m) => {
      const other = m.sender_id === meId ? m.receiver_id : m.sender_id;
      const row = map[other]; if (!row) return;
      if (!row.lastAt) { row.lastMessage = m.content; row.lastAt = m.created_at; }
      if (m.receiver_id === meId && !m.seen) row.unread = (row.unread ?? 0) + 1;
    });
    const sorted = Object.values(map).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
    setUsers(sorted);
    void ids;
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  const filtered = users.filter((u) =>
    !search || u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const active = users.find((u) => u.id === activeId) ?? null;

  return (
    <div className="flex h-full">
      {/* Left: user list */}
      <div className="w-80 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-bold mb-3">Inbox</h2>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-full bg-secondary border-transparent"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No users.</p>
          ) : filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => setActiveId(u.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 mx-2 my-1 rounded-xl text-left hover:bg-secondary transition-colors ${activeId === u.id ? "bg-secondary" : ""}`}
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
              </div>
              {!!u.unread && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Center: conversation */}
      <div className="flex-1 min-w-0 flex flex-col bg-background">
        {active ? <Conversation meId={meId} other={active} /> : <InboxEmpty />}
      </div>

      {/* Right: user info */}
      {active && <UserInfoPanel user={active} />}
    </div>
  );
}

function InboxEmpty() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 text-muted-foreground">
      <Inbox className="h-12 w-12 mb-3 opacity-50" />
      <p className="text-sm">Select a user from the left to start a conversation.</p>
    </div>
  );
}

function Conversation({ meId, other }: { meId: string; other: UserRow }) {
  const [messages, setMessages] = useState<Array<{ id: string; sender_id: string; content: string; created_at: string; seen: boolean }>>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, content, created_at, seen")
      .or(`and(sender_id.eq.${meId},receiver_id.eq.${other.id}),and(sender_id.eq.${other.id},receiver_id.eq.${meId})`)
      .order("created_at", { ascending: true });
    setMessages(data ?? []);
    // mark seen
    await supabase
      .from("messages")
      .update({ seen: true })
      .eq("sender_id", other.id)
      .eq("receiver_id", meId)
      .eq("seen", false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`admin-conv-${other.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [other.id]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase.from("messages").insert({ sender_id: meId, receiver_id: other.id, content });
    if (error) toast.error(error.message);
  }

  return (
    <>
      <div className="px-5 py-3 border-b border-border bg-card flex items-center gap-3">
        <Avatar name={other.username} url={other.avatar_url} size={36} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{other.username}</p>
          <p className="text-xs text-muted-foreground">{other.online ? "Active now" : `Last seen ${formatDistanceToNow(new Date(other.last_seen), { addSuffix: true })}`}</p>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">No messages yet. Say hi.</p>
        ) : messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"}`}>
                {m.content}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="p-3 border-t border-border bg-card flex items-center gap-2">
        <Input
          placeholder="Reply to user…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-full bg-secondary border-transparent h-11"
        />
        <Button type="submit" size="icon" className="rounded-full h-11 w-11 shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </>
  );
}

function UserInfoPanel({ user }: { user: UserRow }) {
  return (
    <aside className="w-72 border-l border-border bg-card hidden lg:flex flex-col">
      <div className="p-6 text-center border-b border-border">
        <div className="flex justify-center mb-3">
          <Avatar name={user.username} url={user.avatar_url} size={80} />
        </div>
        <p className="font-bold text-lg">{user.username}</p>
        <p className="text-xs text-muted-foreground">{user.email ?? "—"}</p>
        <p className={`text-xs mt-2 ${user.online ? "text-green-500" : "text-muted-foreground"}`}>
          {user.online ? "● Active now" : `Last seen ${formatDistanceToNow(new Date(user.last_seen), { addSuffix: true })}`}
        </p>
      </div>
      <div className="p-5 space-y-4 text-sm">
        <InfoRow label="User ID" value={user.id.slice(0, 8) + "…"} />
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Quick actions</p>
          <p className="text-xs text-muted-foreground italic">Notes, tags, credits & payments — coming next step.</p>
        </div>
      </div>
    </aside>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

/* ---------------- ADMINS (super admin only) ---------------- */

type AdminRow = {
  user_id: string;
  role: AppRole;
  username: string;
  email: string | null;
  avatar_url: string | null;
};

function AdminsView() {
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
        email: null,
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
    !search || r.username.toLowerCase().includes(search.toLowerCase()) ||
    (r.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Admin team</h1>
            <p className="text-sm text-muted-foreground mt-1">Promote users to admin or super admin.</p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="rounded-full gap-2">
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
                <p className="text-xs text-muted-foreground truncate">{r.email ?? "—"}</p>
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
