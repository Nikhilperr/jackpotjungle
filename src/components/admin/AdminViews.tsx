import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/messenger/Avatar";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2, Tag as TagIcon, Send, Loader2, X, Check, Wallet, Megaphone, Bell, Bot, Activity, KeyRound, Ban, ShieldOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendBroadcast, deleteAdminUser, setUserBlocked, resetUserPassword } from "@/lib/admin-super.functions";

const sb: any = supabase;

/* ============ TAGS ============ */
export function TagsView() {
  const [tags, setTags] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  async function load() {
    const { data } = await sb.from("tags").select("*").order("name");
    setTags(data ?? []);
  }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!name.trim()) return;
    const { error } = await sb.from("tags").insert({ name: name.trim(), color });
    if (error) toast.error(error.message); else { setName(""); load(); }
  }
  async function del(id: string) {
    if (!confirm("Delete tag?")) return;
    await sb.from("tags").delete().eq("id", id);
    load();
  }
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-1">User tags</h2>
      <p className="text-sm text-muted-foreground mb-4">Tags help group users for broadcasts & filtering.</p>
      <div className="flex gap-2 mb-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tag name (e.g. VIP)" />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 rounded border border-border bg-transparent" />
        <Button onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-2">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
            <span className="h-4 w-4 rounded-full" style={{ background: t.color }} />
            <span className="flex-1 font-medium text-sm">{t.name}</span>
            <button onClick={() => del(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {tags.length === 0 && <p className="text-sm text-center text-muted-foreground py-6">No tags yet.</p>}
      </div>
    </div>
  );
}

/* ============ QUICK REPLIES ============ */
export function QuickRepliesView({ meId }: { meId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  async function load() {
    const { data } = await sb.from("quick_replies").select("*").order("created_at", { ascending: false });
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!title.trim() || !content.trim()) return;
    const { error } = await sb.from("quick_replies").insert({ admin_id: meId, title: title.trim(), content: content.trim() });
    if (error) toast.error(error.message); else { setTitle(""); setContent(""); load(); }
  }
  async function del(id: string) {
    if (!confirm("Delete reply?")) return;
    await sb.from("quick_replies").delete().eq("id", id);
    load();
  }
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-1">Quick reply templates</h2>
      <p className="text-sm text-muted-foreground mb-4">Reusable canned messages, shared across admins.</p>
      <div className="bg-card border border-border rounded-2xl p-4 mb-6 space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Greeting)" />
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Message…" rows={3} />
        <Button onClick={add} className="w-full"><Plus className="h-4 w-4 mr-2" /> Save reply</Button>
      </div>
      <div className="space-y-2">
        {items.map((q) => (
          <div key={q.id} className="p-3 bg-card border border-border rounded-lg">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="font-semibold text-sm">{q.title}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{q.content}</p>
              </div>
              <button onClick={() => del(q.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-center text-muted-foreground py-6">No quick replies yet.</p>}
      </div>
    </div>
  );
}

/* ============ BROADCASTS ============ */
export function BroadcastsView() {
  const send = useServerFn(sendBroadcast);
  const [content, setContent] = useState("");
  const [targetType, setTargetType] = useState<"all" | "tag" | "selected">("all");
  const [tagId, setTagId] = useState("");
  const [tags, setTags] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.from("tags").select("*").then(({ data }: any) => setTags(data ?? []));
    sb.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(20)
      .then(({ data }: any) => setHistory(data ?? []));
  }, []);

  async function submit() {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const r = await send({ data: { content: content.trim(), targetType, tagId: tagId || undefined } });
      toast.success(`Sent to ${r.sent} users`);
      setContent("");
      const { data } = await sb.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(20);
      setHistory(data ?? []);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    setBusy(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-1">Broadcast messages</h2>
      <p className="text-sm text-muted-foreground mb-4">Send a page message to many users at once.</p>
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex gap-2">
          {(["all", "tag", "selected"] as const).map((t) => (
            <button key={t} onClick={() => setTargetType(t)}
              className={`flex-1 h-9 rounded-lg text-xs font-semibold uppercase ${targetType === t ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              {t === "all" ? "All users" : t === "tag" ? "By tag" : "Selected"}
            </button>
          ))}
        </div>
        {targetType === "tag" && (
          <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="w-full h-10 rounded-lg bg-secondary px-3 text-sm">
            <option value="">Pick tag…</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {targetType === "selected" && <p className="text-xs text-muted-foreground">Select users from the Inbox panel coming soon. (Use tag or all for now.)</p>}
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Broadcast message…" rows={4} />
        <Button onClick={submit} disabled={busy || !content.trim()} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Megaphone className="h-4 w-4 mr-2" />} Send broadcast
        </Button>
      </div>
      <h3 className="font-semibold text-sm mt-6 mb-2">Recent broadcasts</h3>
      <div className="space-y-2">
        {history.map((b) => (
          <div key={b.id} className="p-3 bg-card border border-border rounded-lg text-sm">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{b.target_type} · {b.sent_count} sent</span>
              <span>{formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}</span>
            </div>
            <p className="whitespace-pre-wrap">{b.content}</p>
          </div>
        ))}
        {history.length === 0 && <p className="text-sm text-center text-muted-foreground py-4">No broadcasts yet.</p>}
      </div>
    </div>
  );
}

/* ============ FOLLOW-UPS ============ */
export function FollowupsView({ meId }: { meId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [target, setTarget] = useState<any | null>(null);
  const [days, setDays] = useState(1);
  const [message, setMessage] = useState("");

  async function load() {
    const { data } = await sb.from("followups").select("*").order("scheduled_at", { ascending: true });
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!userQuery.trim()) { setResults([]); return; }
      const { data } = await sb.from("profiles").select("id, username, avatar_url")
        .ilike("username", `%${userQuery}%`).limit(6);
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [userQuery]);

  async function add() {
    if (!target || !message.trim()) return;
    const scheduled = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await sb.from("followups").insert({
      user_id: target.id, admin_id: meId, days_after: days, scheduled_at: scheduled, message: message.trim(),
    });
    if (error) toast.error(error.message);
    else { setMessage(""); setTarget(null); setUserQuery(""); load(); toast.success("Scheduled"); }
  }

  async function del(id: string) {
    await sb.from("followups").delete().eq("id", id);
    load();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-1">Follow-up reminders</h2>
      <p className="text-sm text-muted-foreground mb-4">Schedule reminders to message a user in 1 / 3 / 7 / 14 days.</p>
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        {target ? (
          <div className="flex items-center gap-2 p-2 bg-secondary rounded-lg">
            <Avatar name={target.username} url={target.avatar_url} size={32} />
            <span className="flex-1 font-medium text-sm">{target.username}</span>
            <button onClick={() => setTarget(null)}><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <>
            <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search user…" />
            {results.length > 0 && (
              <div className="space-y-1">
                {results.map((r) => (
                  <button key={r.id} onClick={() => { setTarget(r); setResults([]); setUserQuery(""); }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-secondary text-left">
                    <Avatar name={r.username} url={r.avatar_url} size={28} />
                    <span className="text-sm">{r.username}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <div className="flex gap-2">
          {[1, 3, 7, 14].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`flex-1 h-9 rounded-lg text-xs font-semibold ${days === d ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              {d} day{d > 1 ? "s" : ""}
            </button>
          ))}
        </div>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Reminder message…" rows={3} />
        <Button onClick={add} disabled={!target || !message.trim()} className="w-full">
          <Bell className="h-4 w-4 mr-2" /> Schedule reminder
        </Button>
      </div>
      <h3 className="font-semibold text-sm mt-6 mb-2">Scheduled</h3>
      <div className="space-y-2">
        {items.map((f) => (
          <div key={f.id} className="p-3 bg-card border border-border rounded-lg text-sm flex items-start gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">In {f.days_after} day(s) · {f.sent ? "Sent" : formatDistanceToNow(new Date(f.scheduled_at), { addSuffix: true })}</p>
              <p>{f.message}</p>
            </div>
            <button onClick={() => del(f.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-center text-muted-foreground py-4">No scheduled follow-ups.</p>}
      </div>
    </div>
  );
}

/* ============ AUTO RESPONSES ============ */
export function AutoResponsesView({ meId }: { meId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [minutes, setMinutes] = useState(15);
  const [message, setMessage] = useState("");
  async function load() {
    const { data } = await sb.from("auto_responses").select("*").order("minutes");
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!message.trim()) return;
    const { error } = await sb.from("auto_responses").insert({ admin_id: meId, minutes, message: message.trim() });
    if (error) toast.error(error.message); else { setMessage(""); load(); }
  }
  async function toggle(r: any) {
    await sb.from("auto_responses").update({ enabled: !r.enabled }).eq("id", r.id);
    load();
  }
  async function del(id: string) {
    await sb.from("auto_responses").delete().eq("id", id);
    load();
  }
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-1">Auto-response</h2>
      <p className="text-sm text-muted-foreground mb-4">Sends after N minutes of admin silence on a conversation.</p>
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex gap-2">
          {[15, 30, 60].map((m) => (
            <button key={m} onClick={() => setMinutes(m)}
              className={`flex-1 h-9 rounded-lg text-xs font-semibold ${minutes === m ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              {m} min
            </button>
          ))}
        </div>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Auto reply (e.g. We'll be back soon!)" rows={3} />
        <Button onClick={add} className="w-full"><Bot className="h-4 w-4 mr-2" /> Save</Button>
      </div>
      <div className="mt-6 space-y-2">
        {items.map((r) => (
          <div key={r.id} className="p-3 bg-card border border-border rounded-lg flex items-start gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">After {r.minutes} min</p>
              <p className="text-sm">{r.message}</p>
            </div>
            <button onClick={() => toggle(r)}
              className={`text-xs px-2 py-1 rounded-full ${r.enabled ? "bg-green-500/15 text-green-600" : "bg-secondary text-muted-foreground"}`}>
              {r.enabled ? "On" : "Off"}
            </button>
            <button onClick={() => del(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-center text-muted-foreground py-4">No auto-responses.</p>}
      </div>
    </div>
  );
}

/* ============ LOGS ============ */
export function LogsView() {
  const [tab, setTab] = useState<"activity" | "login">("activity");
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    const table = tab === "activity" ? "activity_logs" : "login_logs";
    const { data } = await sb.from(table).select("*").order("created_at", { ascending: false }).limit(200);
    setRows(data ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold mb-3">Logs</h2>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab("activity")} className={`px-3 h-9 rounded-lg text-sm ${tab === "activity" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Activity</button>
        <button onClick={() => setTab("login")} className={`px-3 h-9 rounded-lg text-sm ${tab === "login" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Logins</button>
      </div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No logs.</p> : rows.map((r) => (
          <div key={r.id} className="px-4 py-2 border-b border-border last:border-0 text-sm flex items-center gap-3">
            <Activity className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-xs">{r.user_id?.slice(0, 8) ?? "—"}</span>
            <span className="flex-1 truncate">{tab === "activity" ? r.action : (r.success ? "Login" : "Login failed") + (r.user_agent ? ` · ${r.user_agent.slice(0, 60)}` : "")}</span>
            <span className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ USER DETAIL PANEL (notes/tags/credits/payments/referrer) ============ */
export function UserDetailPanel({ userId, username, avatar, variant = "desktop" }: { userId: string; username: string; avatar: string | null; variant?: "desktop" | "embedded" }) {
  const blockFn = useServerFn(setUserBlocked);
  const [tags, setTags] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteText, setNoteText] = useState("");
  const [credit, setCredit] = useState(0);
  const [creditAmt, setCreditAmt] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [totals, setTotals] = useState({ loaded: 0, paid: 0 });
  const [referrer, setReferrer] = useState<{ id: string; username: string } | null>(null);
  const [pickRef, setPickRef] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  async function loadAll() {
    const [t, all, n, c, tx, ref, prof] = await Promise.all([
      sb.from("user_tags").select("tag_id, tags(id,name,color)").eq("user_id", userId),
      sb.from("tags").select("*"),
      sb.from("user_notes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      sb.from("user_credits").select("balance").eq("user_id", userId).maybeSingle(),
      sb.from("credit_transactions").select("amount, type").eq("user_id", userId),
      sb.from("referrals").select("referrer_id").eq("referred_id", userId).maybeSingle(),
      sb.from("profiles").select("is_blocked").eq("id", userId).maybeSingle(),
    ]);
    setTags((t.data ?? []).map((r: any) => r.tags));
    setAllTags(all.data ?? []);
    setNotes(n.data ?? []);
    setCredit(Number(c.data?.balance ?? 0));
    const loaded = (tx.data ?? []).filter((r: any) => Number(r.amount) > 0).reduce((s: number, r: any) => s + Number(r.amount), 0);
    const paidTx = (tx.data ?? []).filter((r: any) => r.type === "paid" || Number(r.amount) < 0).reduce((s: number, r: any) => s + Math.abs(Number(r.amount)), 0);
    setTotals({ loaded, paid: paidTx });
    setIsBlocked(!!prof.data?.is_blocked);
    if (ref.data?.referrer_id) {
      const { data: p2 } = await sb.from("profiles").select("id, username").eq("id", ref.data.referrer_id).maybeSingle();
      setReferrer(p2 ?? null);
    } else setReferrer(null);
  }
  useEffect(() => {
    loadAll();
    const ch = sb
      .channel(`user-detail-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_credits", filter: `user_id=eq.${userId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_transactions", filter: `user_id=eq.${userId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, () => loadAll())
      .subscribe();
    return () => { sb.removeChannel(ch); };
    /* eslint-disable-next-line */
  }, [userId]);

  async function toggleBlock() {
    try {
      await blockFn({ data: { userId, blocked: !isBlocked } });
      toast.success(!isBlocked ? "User blocked" : "User unblocked");
      setIsBlocked(!isBlocked);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }


  async function toggleTag(tagId: string) {
    const exists = tags.some((t: any) => t.id === tagId);
    if (exists) await sb.from("user_tags").delete().eq("user_id", userId).eq("tag_id", tagId);
    else await sb.from("user_tags").insert({ user_id: userId, tag_id: tagId });
    loadAll();
  }
  async function addNote() {
    if (!noteText.trim()) return;
    const me = (await supabase.auth.getUser()).data.user?.id;
    if (!me) return;
    await sb.from("user_notes").insert({ user_id: userId, admin_id: me, note: noteText.trim() });
    setNoteText(""); loadAll();
  }
  async function delNote(id: string) {
    await sb.from("user_notes").delete().eq("id", id); loadAll();
  }
  async function adjust(sign: number) {
    const amt = parseFloat(creditAmt);
    if (!amt || amt <= 0) return toast.error("Enter amount");
    const { error } = await sb.rpc("adjust_credits", {
      _user_id: userId, _amount: sign * amt, _type: sign > 0 ? "add" : "paid", _note: creditNote || null,
    });
    if (error) toast.error(error.message); else { setCreditAmt(""); setCreditNote(""); loadAll(); toast.success(sign > 0 ? "Credit loaded" : "Marked paid"); }
  }
  async function setRef(refId: string) {
    if (refId === userId) return toast.error("Can't refer self");
    await sb.from("referrals").delete().eq("referred_id", userId);
    const { error } = await sb.from("referrals").insert({
      referrer_id: refId, referred_id: userId, status: "pending", bonus_amount: 0,
    });
    if (error) toast.error(error.message);
    else { toast.success("Referrer set"); setPickRef(false); loadAll(); }
  }

  const Body = (
    <>
      <div className="p-5 text-center border-b border-border">
        <div className="flex justify-center mb-2"><Avatar name={username} url={avatar} size={72} /></div>
        <p className="font-bold">{username}</p>
        <div className="flex justify-center gap-1 mt-2 flex-wrap">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary font-semibold">Credits {credit}</span>
          {isBlocked && <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-semibold">Blocked</span>}
          {tags.map((t: any) => t && (
            <span key={t.id} className="text-[11px] px-2 py-0.5 rounded-full text-white font-semibold" style={{ background: t.color }}>{t.name}</span>
          ))}
        </div>
        <Button size="sm" variant={isBlocked ? "outline" : "destructive"} onClick={toggleBlock} className="mt-3 w-full">
          {isBlocked ? <><ShieldOff className="h-3 w-3 mr-1" />Unblock user</> : <><Ban className="h-3 w-3 mr-1" />Block user</>}
        </Button>
      </div>

      {/* Credits — editable load / paid */}
      <section className="p-4 border-b border-border">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-2 flex items-center gap-1"><Wallet className="h-3 w-3" /> Credit</p>
        <p className="text-3xl font-bold">{credit}</p>
        <div className="grid grid-cols-2 gap-2 text-[11px] my-3">
          <div className="bg-secondary rounded-lg p-2"><p className="text-muted-foreground">Total loaded</p><p className="font-bold text-sm">{totals.loaded.toFixed(2)}</p></div>
          <div className="bg-secondary rounded-lg p-2"><p className="text-muted-foreground">Total paid</p><p className="font-bold text-sm">{totals.paid.toFixed(2)}</p></div>
        </div>
        <Input value={creditAmt} onChange={(e) => setCreditAmt(e.target.value)} placeholder="Amount" type="number" inputMode="decimal" className="h-10 mb-2" />
        <Input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="Note (optional)" className="h-10 mb-2" />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => adjust(1)} className="flex-1">Load</Button>
          <Button size="sm" variant="outline" onClick={() => adjust(-1)} className="flex-1">Paid</Button>
        </div>
      </section>

      {/* Tags */}
      <section className="p-4 border-b border-border">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-2 flex items-center gap-1"><TagIcon className="h-3 w-3" /> Tags</p>
        <div className="flex flex-wrap gap-1">
          {allTags.map((t: any) => {
            const on = tags.some((x: any) => x?.id === t.id);
            return (
              <button key={t.id} onClick={() => toggleTag(t.id)}
                className={`text-[11px] px-2 py-1 rounded-full border ${on ? "border-transparent text-white" : "border-border text-muted-foreground"}`}
                style={on ? { background: t.color } : {}}>
                {on && <Check className="inline h-2.5 w-2.5 mr-1" />}{t.name}
              </button>
            );
          })}
          {allTags.length === 0 && <p className="text-xs text-muted-foreground">Create tags in the Tags tab.</p>}
        </div>
      </section>

      {/* Referred by */}
      <section className="p-4 border-b border-border">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-2">Referred by</p>
        {referrer ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{referrer.username}</span>
            <Button size="sm" variant="outline" onClick={() => setPickRef(true)}>Change</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setPickRef(true)} className="w-full">
            <Plus className="h-3 w-3 mr-1" /> Set referrer
          </Button>
        )}
      </section>

      {/* Notes */}
      <section className="p-4">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-2">Internal notes</p>
        <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add internal note…" rows={2} className="text-sm mb-2" />
        <Button size="sm" onClick={addNote} className="w-full mb-3"><Plus className="h-3 w-3 mr-1" /> Add note</Button>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {notes.map((n) => (
            <div key={n.id} className="text-xs p-2 bg-secondary rounded-lg group">
              <p>{n.note}</p>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                <button onClick={() => delNote(n.id)} className="opacity-0 group-hover:opacity-100"><Trash2 className="h-3 w-3 text-destructive" /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {pickRef && <UserPickerDialog excludeId={userId} onPick={setRef} onClose={() => setPickRef(false)} />}
    </>
  );

  if (variant === "embedded") {
    return <div className="h-full overflow-y-auto bg-card">{Body}</div>;
  }
  return (
    <aside className="w-80 border-l border-border bg-card hidden lg:flex flex-col overflow-y-auto">
      {Body}
    </aside>
  );
}

function UserPickerDialog({ excludeId, onPick, onClose }: { excludeId: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      const { data } = await sb.from("profiles").select("id, username, avatar_url, friend_code")
        .or(`username.ilike.%${q}%,friend_code.ilike.%${q}%`).neq("id", excludeId).limit(8);
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, excludeId]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold mb-3">Pick referrer</h3>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username or friend code" className="mb-3" />
        <div className="max-h-64 overflow-y-auto space-y-1">
          {results.map((r) => (
            <button key={r.id} onClick={() => onPick(r.id)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-secondary text-left">
              <Avatar name={r.username} url={r.avatar_url} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{r.username}</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate">{r.friend_code}</p>
              </div>
            </button>
          ))}
          {q && results.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No matches.</p>}
        </div>
      </div>
    </div>
  );
}

/* ============ SUPER ADMIN SETTINGS ============ */
export function SuperAdminView() {
  const [admins, setAdmins] = useState<any[]>([]);
  const delFn = useServerFn(deleteAdminUser);
  const blockFn = useServerFn(setUserBlocked);
  const resetFn = useServerFn(resetUserPassword);
  const [pwdFor, setPwdFor] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");

  async function load() {
    const { data: roles } = await sb.from("user_roles").select("user_id, role").in("role", ["admin", "super_admin"]);
    const ids = [...new Set((roles ?? []).map((r: any) => r.user_id))];
    if (ids.length === 0) { setAdmins([]); return; }
    const { data: profs } = await sb.from("profiles").select("id, username, avatar_url, is_blocked").in("id", ids);
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
    setAdmins((roles ?? []).map((r: any) => ({ ...r, profile: byId.get(r.user_id) })));
  }
  useEffect(() => { load(); }, []);

  async function del(uid: string) {
    if (!confirm("Permanently delete this admin account?")) return;
    try { await delFn({ data: { userId: uid } }); toast.success("Deleted"); load(); }
    catch (e: any) { toast.error(e?.message); }
  }
  async function block(uid: string, blocked: boolean) {
    try { await blockFn({ data: { userId: uid, blocked } }); toast.success(blocked ? "Blocked" : "Unblocked"); load(); }
    catch (e: any) { toast.error(e?.message); }
  }
  async function reset() {
    if (!pwdFor || pwd.length < 6) return;
    try { await resetFn({ data: { userId: pwdFor, newPassword: pwd } }); toast.success("Password reset"); setPwdFor(null); setPwd(""); }
    catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-1">Super admin settings</h2>
      <p className="text-sm text-muted-foreground mb-4">Manage admin accounts: block, reset password, delete.</p>
      <div className="bg-card border border-border rounded-2xl divide-y divide-border">
        {admins.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No admins.</p> : admins.map((a) => (
          <div key={`${a.user_id}-${a.role}`} className="p-4 flex items-center gap-3 flex-wrap">
            <Avatar name={a.profile?.username ?? "?"} url={a.profile?.avatar_url ?? null} size={40} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{a.profile?.username ?? "(unknown)"}</p>
              <p className="text-xs text-muted-foreground">{a.role} {a.profile?.is_blocked && <span className="text-destructive ml-1">· blocked</span>}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPwdFor(a.user_id)}><KeyRound className="h-3 w-3 mr-1" /> Reset PW</Button>
            <Button size="sm" variant="outline" onClick={() => block(a.user_id, !a.profile?.is_blocked)}>
              {a.profile?.is_blocked ? <><ShieldOff className="h-3 w-3 mr-1" />Unblock</> : <><Ban className="h-3 w-3 mr-1" />Block</>}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => del(a.user_id)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        ))}
      </div>

      {pwdFor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPwdFor(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-2">Reset password</h3>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="New password (min 6)" className="mb-3" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPwdFor(null)} className="flex-1">Cancel</Button>
              <Button onClick={reset} disabled={pwd.length < 6} className="flex-1">Reset</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ REFERRALS (admin view of all) ============ */
export function ReferralsAdminView() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  async function load() {
    const { data } = await sb.from("referrals").select("*").order("created_at", { ascending: false });
    if (!data) { setRows([]); return; }
    const ids = [...new Set(data.flatMap((r: any) => [r.referrer_id, r.referred_id]))];
    const { data: profs } = await sb.from("profiles").select("id, username").in("id", ids);
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p.username]));
    setRows(data.map((r: any) => ({ ...r, referrer: byId.get(r.referrer_id), referred: byId.get(r.referred_id) })));
  }
  useEffect(() => { load(); }, []);
  async function approve(id: string, bonus: number) {
    await sb.from("referrals").update({ status: "approved", bonus_amount: bonus }).eq("id", id);
    load();
  }
  const q = search.trim().toLowerCase();
  const filtered = q ? rows.filter((r) =>
    (r.referrer ?? "").toLowerCase().includes(q) ||
    (r.referred ?? "").toLowerCase().includes(q) ||
    r.status.toLowerCase().includes(q)
  ) : rows;
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-1">Referrals</h2>
      <p className="text-sm text-muted-foreground mb-4">Track referrals and approve bonuses.</p>
      <div className="relative mb-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by referrer, referred, or status…" className="rounded-full bg-secondary border-transparent" />
      </div>
      <div className="bg-card border border-border rounded-2xl divide-y divide-border">
        {filtered.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No referrals.</p> : filtered.map((r) => (
          <div key={r.id} className="p-4 flex items-center gap-3 flex-wrap text-sm">
            <div className="flex-1 min-w-0">
              <p><span className="font-semibold">{r.referrer ?? r.referrer_id.slice(0, 8)}</span> → <span className="font-semibold">{r.referred ?? r.referred_id.slice(0, 8)}</span></p>
              <p className="text-xs text-muted-foreground">Bonus: {r.bonus_amount} · {r.status}</p>
            </div>
            {r.status !== "approved" && (
              <Button size="sm" onClick={() => {
                const v = prompt("Bonus amount", "10"); if (v) approve(r.id, parseFloat(v) || 0);
              }}>Approve</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ PROFILE (embedded inside admin) ============ */
export function AdminProfileView({ userId, email }: { userId: string; email: string | null }) {
  const [profile, setProfile] = useState<any | null>(null);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const { data } = await sb.from("profiles")
      .select("id, username, avatar_url, friend_code, referral_code, created_at")
      .eq("id", userId).maybeSingle();
    if (data) { setProfile(data); setUsername(data.username); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await sb.from("profiles").update({ username }).eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setProfile({ ...profile, username });
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || !profile) return;
    if (!f.type.startsWith("image/")) return toast.error("Pick an image");
    if (f.size > 5 * 1024 * 1024) return toast.error("Max 5MB");
    setUploading(true);
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const ext = f.name.split(".").pop()?.toLowerCase() || "png";
      const url = await uploadAndSign("avatars", profile.id, f, ext, f.type);
      await sb.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
      setProfile({ ...profile, avatar_url: url });
      toast.success("Avatar updated");
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    setUploading(false);
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  if (!profile) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <Avatar name={profile.username} url={profile.avatar_url} size={96} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">{profile.username}</h1>
        <p className="text-sm text-muted-foreground">{email}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => copy(profile.friend_code, "Friend code")} className="bg-secondary rounded-2xl p-4 text-left hover:bg-accent">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Friend code</p>
          <p className="font-mono font-bold mt-1">{profile.friend_code}</p>
        </button>
        <button onClick={() => copy(profile.referral_code, "Referral code")} className="bg-secondary rounded-2xl p-4 text-left hover:bg-accent">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Referral code</p>
          <p className="font-mono font-bold mt-1">{profile.referral_code}</p>
        </button>
      </div>

      <div className="bg-secondary rounded-2xl p-5 space-y-3">
        <p className="font-semibold">Edit profile</p>
        <Input value={username} onChange={(e) => setUsername(e.target.value)} className="bg-card" />
        <Button onClick={save} disabled={saving || username === profile.username} className="rounded-full">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Member since {new Date(profile.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}
