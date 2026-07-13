import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/messenger/Avatar";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2, Tag as TagIcon, Send, Loader2, X, Check, Wallet, Megaphone, Bell, Bot, Activity, KeyRound, Ban, ShieldOff, ArrowLeft, Users, Search, Share, Shield, ShieldCheck, History, Smartphone, Laptop, Globe, User, CheckCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendBroadcast, deleteAdminUser, setUserBlocked, resetUserPassword, getActiveSessionsUser, terminateSessionUser, getPushNotificationTargetCount, sendCustomPushNotificationAllUsers } from "@/lib/admin-super.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const sb: any = supabase;

function getVipBadgeUrl(status: string | null | undefined): string | null {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  if (normalized === "platinum") return "/platium.png";
  if (normalized === "diamond") return "/dimond.png";
  if (normalized === "black_diamond" || normalized === "blackvip") return "/blackvip.png";
  return `/${normalized}.png`;
}

function getVipBadgeStyles(status: string | null | undefined) {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  
  let label = "VIP";
  let color = "#10b981";
  
  if (normalized === "bronze") {
    label = "Bronze VIP";
    color = "#b45309";
  } else if (normalized === "silver") {
    label = "Silver VIP";
    color = "#64748b";
  } else if (normalized === "gold") {
    label = "Gold VIP";
    color = "#d97706";
  } else if (normalized === "platinum") {
    label = "Platinum VIP";
    color = "#0891b2";
  } else if (normalized === "diamond") {
    label = "Diamond VIP";
    color = "#2563eb";
  } else if (normalized === "black_diamond" || normalized === "blackvip") {
    label = "Black Diamond VIP";
    color = "#000000";
  }
  
  return { label, color };
}

/* ============ CONFIRM DIALOG HOOK ============ */
function useConfirm() {
  const [state, setState] = useState<{ open: boolean; title: string; desc?: string; confirmText?: string; destructive?: boolean; resolve?: (v: boolean) => void }>({ open: false, title: "" });
  const ask = (opts: { title: string; desc?: string; confirmText?: string; destructive?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ open: true, ...opts, resolve }));
  const node = (
    <AlertDialog open={state.open} onOpenChange={(o) => { if (!o) { state.resolve?.(false); setState((s) => ({ ...s, open: false })); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          {state.desc && <AlertDialogDescription>{state.desc}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { state.resolve?.(false); setState((s) => ({ ...s, open: false })); }}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={state.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            onClick={() => { state.resolve?.(true); setState((s) => ({ ...s, open: false })); }}
          >{state.confirmText ?? "Confirm"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { ask, node };
}

/* ============ TAGS ============ */
export function TagsView() {
  const [tags, setTags] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const { ask, node: confirmNode } = useConfirm();
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
  async function del(id: string, label: string) {
    if (!(await ask({ title: "Delete tag?", desc: `“${label}” will be removed from all users.`, confirmText: "Delete", destructive: true }))) return;
    await sb.from("user_tags").delete().eq("tag_id", id);
    await sb.from("tags").delete().eq("id", id);
    load();
  }
  return (
    <div className="p-6 max-w-2xl mx-auto">
      {confirmNode}
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
            <button onClick={() => del(t.id, t.name)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ask, node: confirmNode } = useConfirm();

  function parseQuickReply(content: string): { text: string; imageUrl: string | null } {
    if (content.startsWith("{") && content.endsWith("}")) {
      try {
        const parsed = JSON.parse(content);
        return {
          text: parsed.text ?? "",
          imageUrl: parsed.image_url ?? null
        };
      } catch {}
    }
    return { text: content, imageUrl: null };
  }

  async function load() {
    const { data } = await sb.from("quick_replies").select("*").order("created_at", { ascending: false });
    setItems(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    setUploading(true);
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("chat-images", meId, file, ext, file.type);
      setImageUrl(url);
      toast.success("Image uploaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image");
    } finally {
      setUploading(false);
    }
  }

  async function add() {
    if (!title.trim()) return;
    if (!content.trim() && !imageUrl) return;

    const finalContent = imageUrl
      ? JSON.stringify({ text: content.trim(), image_url: imageUrl })
      : content.trim();

    const { error } = await sb.from("quick_replies").insert({ admin_id: meId, title: title.trim(), content: finalContent });
    if (error) {
      toast.error(error.message);
    } else {
      setTitle("");
      setContent("");
      setImageUrl(null);
      load();
      toast.success("Quick reply saved!");
    }
  }

  async function del(id: string, label: string) {
    if (!(await ask({ title: "Delete quick reply?", desc: `“${label}” will be permanently removed.`, confirmText: "Delete", destructive: true }))) return;
    await sb.from("quick_replies").delete().eq("id", id);
    load();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {confirmNode}
      <h2 className="text-xl font-bold mb-1">Quick reply templates</h2>
      <p className="text-sm text-muted-foreground mb-4">Reusable canned messages, shared across admins.</p>
      
      <div className="bg-card border border-border rounded-2xl p-4 mb-6 space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Greeting)" />
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Message…" rows={3} />
        
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handlePickImage} 
            accept="image/*" 
            className="hidden" 
          />
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-semibold"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1.5" />
            )}
            Attach Image
          </Button>
          {imageUrl && (
            <div className="flex items-center gap-2 bg-secondary/60 rounded-lg pl-2 pr-1 py-1 border border-border">
              <span className="text-xs text-muted-foreground truncate max-w-[150px]">Image attached</span>
              <button 
                type="button" 
                onClick={() => setImageUrl(null)} 
                className="h-5 w-5 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        
        {imageUrl && (
          <div className="relative h-20 w-20 rounded border border-border overflow-hidden bg-secondary">
            <img src={imageUrl} alt="Attached Preview" className="h-full w-full object-cover" />
            <button 
              type="button" 
              onClick={() => setImageUrl(null)}
              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        
        <Button onClick={add} disabled={!title.trim() || uploading} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Save reply
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((q) => {
          const parsed = parseQuickReply(q.content);
          return (
            <div key={q.id} className="p-3 bg-card border border-border rounded-lg flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 flex items-start gap-3">
                {parsed.imageUrl && (
                  <img src={parsed.imageUrl} alt="" className="h-12 w-12 rounded object-cover border border-border shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    <span>{q.title}</span>
                    {parsed.imageUrl && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">Image Attached</span>}
                  </p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{parsed.text || "[Image message only]"}</p>
                </div>
              </div>
              <button onClick={() => del(q.id, q.title)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}
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
      console.log("[BroadcastsView] submitting", { targetType, tagId, contentLen: content.trim().length });
      const r = await send({ data: { content: content.trim(), targetType, tagId: tagId || undefined } });
      console.log("[BroadcastsView] result", r);
      toast.success(`Sent to ${r.sent} users`);

      setContent("");
      const { data, error } = await sb.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) console.error("[BroadcastsView] history reload failed", error);
      setHistory(data ?? []);
    } catch (e: any) {
      console.error("[BroadcastsView] send failed", e);
      toast.error(e?.message ?? "Failed");
    }
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
export function UserDetailPanel({
  userId,
  username,
  avatar,
  variant = "desktop",
  onClose,
  onCreateGroupClick,
  onSearchClick,
  onShareClick,
  onWalletClick,
  onHistoryClick,
  onUserClick
}: {
  userId: string;
  username: string;
  avatar: string | null;
  variant?: "desktop" | "embedded";
  onClose?: () => void;
  onCreateGroupClick?: () => void;
  onSearchClick?: () => void;
  onShareClick?: () => void;
  onWalletClick?: () => void;
  onHistoryClick?: () => void;
  onUserClick?: (userId: string) => void;
}) {
  const blockFn = useServerFn(setUserBlocked);
  const [tags, setTags] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteText, setNoteText] = useState("");
  const [totals, setTotals] = useState({ loaded: 0, paid: 0 });
  const [referrer, setReferrer] = useState<{ id: string; username: string } | null>(null);
  const [pickRef, setPickRef] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [role, setRole] = useState<"admin" | "super_admin" | "user">("user");

  async function loadAll() {
    const [t, all, n, ref, prof, r] = await Promise.all([
      sb.from("user_tags").select("tag_id, tags(id,name,color)").eq("user_id", userId),
      sb.from("tags").select("*"),
      sb.from("user_notes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      sb.from("referrals").select("referrer_id").eq("referred_id", userId).maybeSingle(),
      sb.from("profiles").select("is_blocked, first_name, last_name, phone, address, friend_code, created_at, wallet_balance, credit_balance, wallet_deposits, wallet_released, wallet_used, vip_status").eq("id", userId).maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setTags((t.data ?? []).map((r: any) => r.tags));
    setAllTags(all.data ?? []);
    setNotes(n.data ?? []);
    setIsBlocked(!!prof.data?.is_blocked);
    setProfileData(prof.data || null);

    // Map stats for display in details card
    setTotals({
      loaded: Number(prof.data?.wallet_deposits ?? 0),
      paid: Number(prof.data?.wallet_used ?? 0)
    });

    const rolesList = (r.data ?? []).map((x: any) => x.role);
    if (rolesList.includes("super_admin")) setRole("super_admin");
    else if (rolesList.includes("admin")) setRole("admin");
    else setRole("user");

    if (ref.data?.referrer_id) {
      const { data: p2 } = await sb.from("profiles").select("id, username").eq("id", ref.data.referrer_id).maybeSingle();
      setReferrer(p2 ?? null);
    } else setReferrer(null);
  }
  useEffect(() => {
    loadAll();
    const ch = sb
      .channel(`user-detail-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${userId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, () => loadAll())
      .subscribe();

    const handleWalletUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.userId === userId) {
        loadAll();
      }
    };
    window.addEventListener("wallet-updated", handleWalletUpdate);

    return () => {
      sb.removeChannel(ch);
      window.removeEventListener("wallet-updated", handleWalletUpdate);
    };
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
        <p className="font-bold flex items-center justify-center gap-1.5">
          <span>{username}</span>
          {profileData?.vip_status && profileData.vip_status !== "none" && (
            <img 
              src={getVipBadgeUrl(profileData.vip_status) || undefined} 
              alt={`${profileData.vip_status} VIP`} 
              className="h-5 w-auto object-contain select-none shrink-0"
              title={`${profileData.vip_status.toUpperCase()} VIP`}
            />
          )}
          {role === "super_admin" && (
            <span title="Super Admin">
              <ShieldCheck className="h-4 w-4 text-amber-500 fill-amber-500/10 shrink-0" />
            </span>
          )}
          {role === "admin" && (
            <span title="Admin User">
              <Shield className="h-4 w-4 text-blue-500 fill-blue-500/10 shrink-0" />
            </span>
          )}
        </p>
        <div className="flex justify-center gap-1.5 mt-2 flex-wrap select-none">
          {(() => {
            const info = getVipBadgeStyles(profileData?.vip_status);
            if (!info) return null;
            return (
              <span 
                className="text-[11px] px-2 py-0.5 rounded-full font-bold border"
                style={{
                  color: info.color,
                  backgroundColor: `${info.color}10`,
                  borderColor: `${info.color}25`
                }}
              >
                {info.label}
              </span>
            );
          })()}
          <button
            onClick={onWalletClick}
            className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-500/20 transition-colors"
          >
            Wallet: ${(profileData?.wallet_balance ?? 0).toFixed(2)}
          </button>
          <button
            onClick={onWalletClick}
            className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold hover:bg-amber-500/20 transition-colors"
          >
            Credit: ${(profileData?.credit_balance ?? 0).toFixed(2)}
          </button>
          {isBlocked && <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-semibold">Blocked</span>}
          {tags.map((t: any) => t && (
            <span key={t.id} className="text-[11px] px-2 py-0.5 rounded-full text-white font-semibold" style={{ background: t.color }}>{t.name}</span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 w-full">
          <Button size="sm" variant={isBlocked ? "outline" : "destructive"} onClick={toggleBlock} className="flex-1">
            {isBlocked ? <><ShieldOff className="h-3.5 w-3.5 mr-1.5" />Unblock</> : <><Ban className="h-3.5 w-3.5 mr-1.5" />Block</>}
          </Button>
          {onCreateGroupClick && username !== "jackpotjungle" && (
            <Button size="sm" variant="outline" onClick={onCreateGroupClick} className="flex-1 border-primary/20 hover:bg-primary/5 text-primary hover:text-primary transition-all">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Group
            </Button>
          )}
          {onSearchClick && (
            <Button size="sm" variant="outline" onClick={onSearchClick} className="flex-1 border-primary/20 hover:bg-primary/5 text-primary hover:text-primary transition-all">
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Search
            </Button>
          )}
          {onShareClick && (
            <Button size="sm" variant="outline" onClick={onShareClick} className="flex-1 border-primary/20 hover:bg-primary/5 text-primary hover:text-primary transition-all">
              <Share className="h-3.5 w-3.5 mr-1.5" />
              Share
            </Button>
          )}
        </div>
      </div>

      {/* User Profile Details */}
      <section className="p-4 border-b border-border">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-2">User Profile</p>
        <div className="bg-secondary/40 border border-border/50 rounded-2xl p-4 space-y-3">
          <div className="space-y-1">
            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Full Name</span>
            <p className="text-sm font-semibold text-foreground">
              {profileData?.first_name || profileData?.last_name
                ? `${profileData?.first_name ?? ""} ${profileData?.last_name ?? ""}`.trim()
                : "Not specified"}
            </p>
          </div>
          <div className="space-y-1 pt-1.5 border-t border-border/40">
            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Phone</span>
            <p className="text-sm font-semibold text-foreground break-words">{profileData?.phone || "Not specified"}</p>
          </div>
          <div className="space-y-1 pt-1.5 border-t border-border/40">
            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Address</span>
            <p className="text-sm font-semibold text-foreground break-words">{profileData?.address || "Not specified"}</p>
          </div>
          <div className="flex justify-between items-center text-sm pt-2 border-t border-border/40">
            <span className="text-muted-foreground text-xs font-semibold">Friend Code</span>
            <span className="font-mono text-xs font-bold text-foreground">{profileData?.friend_code || "—"}</span>
          </div>
          {profileData?.created_at && (
            <div className="flex justify-between items-center text-sm pt-2 border-t border-border/40">
              <span className="text-muted-foreground text-xs font-semibold">Member Since</span>
              <span className="text-xs font-medium text-foreground">{new Date(profileData.created_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </section>

      {/* Premium Wallet & Credit System */}
      <section className="p-4 border-b border-border">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-3 flex items-center gap-1">
          <Wallet className="h-3.5 w-3.5 text-primary" /> Wallet balances
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onWalletClick}
            className="bg-secondary/40 border border-border/60 hover:bg-secondary/80 transition-colors rounded-xl p-3 text-left w-full"
          >
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Available</p>
            <p className="text-lg font-black text-emerald-500 mt-1">${(profileData?.wallet_balance ?? 0).toFixed(2)}</p>
          </button>
          <button
            onClick={onWalletClick}
            className="bg-secondary/40 border border-border/60 hover:bg-secondary/80 transition-colors rounded-xl p-3 text-left w-full"
          >
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Credit</p>
            <p className="text-lg font-black text-amber-500 mt-1">${(profileData?.credit_balance ?? 0).toFixed(2)}</p>
          </button>
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
            <button 
              type="button" 
              onClick={() => onUserClick?.(referrer.id)}
              className="text-sm font-semibold text-primary hover:underline truncate cursor-pointer text-left"
            >
              {referrer.username}
            </button>
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
    return (
      <div className="h-full flex flex-col bg-card">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0 bg-card">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={onClose}>
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Button>
          <span className="font-bold text-sm">User Details</span>
        </div>
        <div className="flex-1 overflow-y-auto">{Body}</div>
      </div>
    );
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
  const { ask, node: confirmNode } = useConfirm();

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
    if (!(await ask({ title: "Delete admin account?", desc: "This permanently removes the admin user. This cannot be undone.", confirmText: "Delete", destructive: true }))) return;
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
      {confirmNode}
      <h2 className="text-xl font-bold mb-1">Super admin settings</h2>
      <p className="text-sm text-muted-foreground mb-4">Manage admin accounts: block, reset password, delete.</p>
      <div className="bg-card border border-border rounded-2xl divide-y divide-border">
        {admins.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No admins.</p> : admins.map((a) => (
          <div key={`${a.user_id}-${a.role}`} className="p-4 flex items-center gap-3 flex-wrap">
            <Avatar name={a.profile?.username ?? "?"} url={a.profile?.avatar_url ?? null} size={40} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                <span>{a.profile?.username ?? "(unknown)"}</span>
                {a.role === "super_admin" && (
                  <span title="Super Admin">
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-500 fill-amber-500/10 shrink-0" />
                  </span>
                )}
                {a.role === "admin" && (
                  <span title="Admin User">
                    <Shield className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10 shrink-0" />
                  </span>
                )}
              </p>
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
export function ReferralsAdminView({ onUserClick }: { onUserClick?: (userId: string) => void }) {
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
          <div key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap text-sm">
            <div className="flex-1 min-w-0 select-none">
              <p className="flex items-center gap-1.5 flex-wrap">
                <button 
                  type="button" 
                  onClick={() => onUserClick?.(r.referrer_id)}
                  className="font-bold text-primary hover:underline cursor-pointer"
                >
                  {r.referrer ?? r.referrer_id.slice(0, 8)}
                </button>
                <span className="text-muted-foreground">referred</span>
                <button 
                  type="button" 
                  onClick={() => onUserClick?.(r.referred_id)}
                  className="font-bold text-primary hover:underline cursor-pointer"
                >
                  {r.referred ?? r.referred_id.slice(0, 8)}
                </button>
              </p>
              <p className="text-xs text-muted-foreground">Bonus: {r.bonus_amount} · {r.status}</p>
            </div>
            {r.status === "pending" && (
              <Button
                size="sm"
                onClick={async () => {
                  const amtStr = window.prompt("Enter bonus amount ($) for this referral:", "10");
                  if (amtStr === null) return;
                  const amt = parseFloat(amtStr);
                  if (isNaN(amt) || amt < 0) {
                    toast.error("Invalid bonus amount");
                    return;
                  }
                  try {
                    await approve(r.id, amt);
                    toast.success("Referral approved!");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to approve");
                  }
                }}
                className="h-8 rounded-full text-xs font-semibold px-4"
              >
                Approve
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown Device";
  const lowercase = ua.toLowerCase();
  
  let os = "Unknown OS";
  if (lowercase.includes("windows")) os = "Windows PC";
  else if (lowercase.includes("macintosh") || lowercase.includes("mac os")) os = "Mac";
  else if (lowercase.includes("iphone") || lowercase.includes("ipad")) os = "iPhone/iPad";
  else if (lowercase.includes("android")) os = "Android Device";
  else if (lowercase.includes("linux")) os = "Linux PC";

  let browser = "Web Browser";
  if (lowercase.includes("chrome") || lowercase.includes("chromium")) browser = "Chrome";
  else if (lowercase.includes("firefox")) browser = "Firefox";
  else if (lowercase.includes("safari") && !lowercase.includes("chrome")) browser = "Safari";
  else if (lowercase.includes("edge")) browser = "Edge";
  else if (lowercase.includes("opr") || lowercase.includes("opera")) browser = "Opera";
  
  return `${os} (${browser})`;
}

/* ============ PROFILE (embedded inside admin) ============ */
export function AdminProfileView({ userId, email }: { userId: string; email: string | null }) {
  const [profile, setProfile] = useState<any | null>(null);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Sub-tab selection state
  const [activeSubTab, setActiveSubTab] = useState<"profile" | "logins">("profile");

  const [isGoogle, setIsGoogle] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [settingPw, setSettingPw] = useState(false);

  // Elevation states
  const [aalState, setAalState] = useState<{ current: string; next: string } | null>(null);
  const [elevationCode, setElevationCode] = useState("");
  const [elevating, setElevating] = useState(false);
  const [elevated, setElevated] = useState(false);

  // MFA states
  const [mfaStatus, setMfaStatus] = useState<"unverified" | "enrolling" | "active">("unverified");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  // Active sessions / logins states
  const getSessionsFn = useServerFn(getActiveSessionsUser);
  const terminateSessionFn = useServerFn(terminateSessionUser);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Check MFA status
  const checkMFA = async () => {
    try {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) throw error;
      const verifiedTotp = data.all.find((f: any) => (f.factorType === "totp" || f.factor_type === "totp") && f.status === "verified");
      if (verifiedTotp) {
        setMfaStatus("active");
        setMfaFactorId(verifiedTotp.id);
      } else {
        setMfaStatus("unverified");
      }
    } catch {}
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setSettingPw(true);
    try {
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully!");
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setSettingPw(false);
    }
  };

  const checkAalStatus = async () => {
    try {
      const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!error && data) {
        setAalState({ current: data.currentLevel, next: data.nextLevel });
        if (data.currentLevel === "aal2") {
          setElevated(true);
        }
      }
    } catch {}
  };

  useEffect(() => {
    checkMFA();
    checkAalStatus();
    sb.auth.getSession().then(({ data }: any) => {
      if (data.session) {
        setCurrentSessionId(data.session.id);
        const google = data.session.user?.app_metadata?.provider === "google" || data.session.user?.identities?.some((id: any) => id.provider === "google");
        setIsGoogle(!!google);
      }
    });
  }, []);

  const handleElevateSession = async () => {
    setElevating(true);
    try {
      const { data: factors, error: listErr } = await sb.auth.mfa.listFactors();
      if (listErr) throw listErr;
      const totpFactor = factors.totp.find((f: any) => f.status === "verified");
      if (!totpFactor) throw new Error("No verified factor found");

      const { data: challenge, error: challengeErr } = await sb.auth.mfa.challenge({
        factorId: totpFactor.id
      });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await sb.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.id,
        code: elevationCode
      });
      if (verifyErr) throw verifyErr;

      toast.success("Identity verified! Settings unlocked.");
      setElevated(true);
      setAalState((prev: any) => prev ? { ...prev, current: "aal2" } : null);
    } catch (err: any) {
      toast.error(err.message || "Failed to verify authenticator code.");
    } finally {
      setElevating(false);
    }
  };

  const handleEnableMFA = async () => {
    setMfaLoading(true);
    try {
      // Clean up any existing unverified factors to avoid duplication errors
      const { data: factors, error: listError } = await sb.auth.mfa.listFactors();
      if (!listError && factors?.all) {
        const unverified = factors.all.filter((f: any) => f.status === "unverified" || f.status === "unverified");
        for (const factor of unverified) {
          console.log("[MFA_DEBUG] Cleaning up unverified factor:", factor.id);
          try {
            await sb.auth.mfa.unenroll({ factorId: factor.id });
          } catch {}
        }
      }

      const { data, error } = await sb.auth.mfa.enroll({
        factorType: "totp",
        issuer: "JackpotJungle"
      });
      if (error) throw error;
      
      setMfaFactorId(data.id);
      setMfaQrCode(data.totp.qr_code);
      setMfaSecret(data.totp.secret);
      setMfaStatus("enrolling");
      setMfaCode("");
    } catch (err: any) {
      toast.error(err.message || "Failed to start 2FA enrollment");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleCancelEnroll = async () => {
    if (!mfaFactorId) return;
    setMfaLoading(true);
    try {
      await sb.auth.mfa.unenroll({ factorId: mfaFactorId });
      setMfaStatus("unverified");
      setMfaFactorId("");
      setMfaQrCode("");
      setMfaSecret("");
    } catch {}
    setMfaLoading(false);
  };

  const handleVerifyEnroll = async () => {
    setMfaLoading(true);
    try {
      const { data: challenge, error: challengeErr } = await sb.auth.mfa.challenge({
        factorId: mfaFactorId
      });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await sb.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode
      });
      if (verifyErr) throw verifyErr;

      toast.success("Two-Factor Authentication (2FA) is now enabled!");
      setMfaStatus("active");
      setMfaCode("");
    } catch (err: any) {
      toast.error(err.message || "Code verification failed. Check your app and try again.");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMFA = async () => {
    if (!mfaFactorId) return;
    setMfaLoading(true);
    try {
      const { error } = await sb.auth.mfa.unenroll({ factorId: mfaFactorId });
      if (error) throw error;
      toast.success("Two-Factor Authentication disabled.");
      setMfaStatus("unverified");
      setMfaFactorId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to disable MFA");
    } finally {
      setMfaLoading(false);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await getSessionsFn();
      setSessions(res.sessions || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load active sessions");
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    try {
      const res = await terminateSessionFn({ data: { sessionId } });
      if (res.ok) {
        toast.success("Device logged out successfully!");
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to terminate device session");
    }
  };

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

    // Static image validation
    const fileMime = f.type.toLowerCase();
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (fileMime === "image/gif" || ext === "gif") {
      return toast.error("GIF files are not supported. Please choose a static image.");
    }
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    const allowedExts = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
    if (!allowedMimes.includes(fileMime) && !allowedExts.includes(ext)) {
      return toast.error("Unsupported format. Please choose a JPEG, PNG, WEBP, or HEIC image.");
    }

    if (f.size > 5 * 1024 * 1024) return toast.error("Max 5MB");
    setUploading(true);
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
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
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col items-center text-center border-b border-border/40 pb-6">
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

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Sidebar sub-navigation tabs */}
        <div className="w-full md:w-56 shrink-0 flex md:flex-col gap-1 border-b md:border-b-0 md:border-r border-border pb-3 md:pb-0 md:pr-4">
          <button
            type="button"
            onClick={() => setActiveSubTab("profile")}
            className={`flex-1 md:flex-initial flex items-center justify-center md:justify-start gap-2.5 px-3 py-2 text-xs md:text-sm font-bold rounded-xl transition-all ${
              activeSubTab === "profile" 
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <User className="h-4 w-4" />
            <span>My Profile</span>
          </button>
          
          <button
            type="button"
            onClick={() => { setActiveSubTab("logins"); loadSessions(); }}
            className={`flex-1 md:flex-initial flex items-center justify-center md:justify-start gap-2.5 px-3 py-2 text-xs md:text-sm font-bold rounded-xl transition-all ${
              activeSubTab === "logins" 
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>Logins</span>
          </button>
        </div>

        {/* Content panel */}
        <div className="flex-1 w-full space-y-6">
          {activeSubTab === "profile" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => copy(profile.friend_code, "Friend code")} className="bg-secondary rounded-2xl p-4 text-left hover:bg-accent w-full">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Friend code</p>
                  <p className="font-mono font-bold mt-1 truncate">{profile.friend_code}</p>
                </button>
                <button onClick={() => copy(profile.referral_code, "Referral code")} className="bg-secondary rounded-2xl p-4 text-left hover:bg-accent w-full">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Referral code</p>
                  <p className="font-mono font-bold mt-1 truncate">{profile.referral_code}</p>
                </button>
              </div>

              <div className="bg-secondary rounded-2xl p-5 space-y-3">
                <p className="font-semibold text-foreground">Edit profile</p>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} className="bg-card" />
                <Button onClick={save} disabled={saving || username === profile.username} className="rounded-full">
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>

              {aalState && aalState.next === "aal2" && aalState.current !== "aal2" && !elevated ? (
                <div className="bg-secondary/40 border border-amber-500/20 rounded-2xl p-5 space-y-3 text-xs">
                  <p className="font-semibold text-amber-500 flex items-center gap-1.5">
                    <Shield className="h-4 w-4" /> 2FA Verification Required
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    To lock these settings and update password/emails, please enter your Google Authenticator code first.
                  </p>
                  <form onSubmit={(e) => { e.preventDefault(); handleElevateSession(); }} className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <label htmlFor="admin-elevate-code" className="text-[10px] uppercase font-bold text-muted-foreground">Authenticator Code</label>
                      <Input 
                        id="admin-elevate-code" 
                        type="text" 
                        placeholder="000000" 
                        value={elevationCode} 
                        onChange={(e) => setElevationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="bg-card font-mono text-center tracking-widest max-w-[120px] h-9" 
                      />
                    </div>
                    <Button type="submit" disabled={elevationCode.length !== 6 || elevating} size="sm" className="rounded-full">
                      {elevating ? "Verifying..." : "Verify Code"}
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="bg-secondary/40 border border-border/80 rounded-2xl p-5 space-y-3 text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-primary" /> 
                    {isGoogle ? "Create Account Password" : "Change Password"}
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    {isGoogle 
                      ? "You logged in via Google. You can create a password below to allow email & password login in the future."
                      : "Update your account password below."}
                  </p>
                  <form onSubmit={handleSetPassword} className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <label htmlFor="admin-new-pw" className="text-[10px] uppercase font-bold text-muted-foreground">New Password</label>
                      <Input 
                        id="admin-new-pw" 
                        type="password" 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        placeholder="Min 6 characters" 
                        className="bg-card h-9" 
                      />
                    </div>
                    <Button type="submit" disabled={newPassword.length < 6 || settingPw} size="sm" className="rounded-full">
                      {settingPw ? "Updating..." : isGoogle ? "Set Password" : "Update Password"}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}

          {activeSubTab === "logins" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Two-Factor Authentication (MFA) Card */}
              <div className="bg-secondary rounded-2xl p-5 space-y-4">
                <h2 className="font-semibold flex items-center gap-2 text-foreground">
                  <Shield className="h-5 w-5 text-primary" /> Two-Factor Authentication
                </h2>
                
                {mfaStatus === "unverified" && (
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Protect your admin account with an extra layer of security. Verifying logins with Google Authenticator prevents unauthorized access even if someone knows your password.
                    </p>
                    <Button
                      type="button"
                      onClick={handleEnableMFA}
                      disabled={mfaLoading}
                      className="rounded-full w-full sm:w-auto text-xs font-bold font-sans"
                    >
                      {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      Enable 2FA Protection
                    </Button>
                  </div>
                )}

                {mfaStatus === "enrolling" && mfaQrCode && (
                  <div className="space-y-4 flex flex-col items-center text-center p-4 bg-card border border-border/80 rounded-2xl select-none">
                    <p className="text-xs font-semibold text-foreground">Scan QR Code or enter the secret key in Google Authenticator</p>
                    <div className="p-3 bg-white rounded-xl shadow-inner my-1">
                      <img src={mfaQrCode} alt="TOTP QR Code" className="h-40 w-40" />
                    </div>
                    <div className="w-full max-w-xs space-y-1 text-left">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Secret Key</p>
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          readOnly
                          value={mfaSecret}
                          className="flex-1 bg-secondary border border-border rounded-lg text-xs font-mono p-2 text-foreground select-all outline-none"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { navigator.clipboard.writeText(mfaSecret); toast.success("Secret copied!"); }}
                          className="rounded-lg h-9 text-xs font-sans font-bold shrink-0"
                        >
                          Copy
                        </Button>
                      </div>
                    </div>

                    <div className="w-full max-w-xs space-y-2 text-left pt-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase">Enter 6-digit Code</label>
                      <Input
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000 000"
                        maxLength={6}
                        className="text-center font-mono text-lg font-black tracking-widest bg-secondary h-11"
                      />
                      <div className="flex gap-2 pt-1.5">
                        <Button
                          variant="outline"
                          onClick={handleCancelEnroll}
                          disabled={mfaLoading}
                          className="flex-1 rounded-xl h-10 text-xs font-bold"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleVerifyEnroll}
                          disabled={mfaCode.length !== 6 || mfaLoading}
                          className="flex-1 rounded-xl h-10 text-xs font-bold"
                        >
                          {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                          Verify Code
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {mfaStatus === "active" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3.5 bg-green-500/10 border border-green-500/25 text-green-600 rounded-xl">
                      <CheckCircle className="h-5 w-5 shrink-0" />
                      <div className="text-xs">
                        <p className="font-bold">MFA Protection is Active</p>
                        <p className="opacity-95 mt-0.5">Your admin account is secured. Logins require Google Authenticator codes.</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDisableMFA}
                      disabled={mfaLoading}
                      className="rounded-full w-full sm:w-auto text-xs font-bold font-sans"
                    >
                      {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      Disable Two-Factor Authentication
                    </Button>
                  </div>
                )}
              </div>

              {/* Active Devices / Logins Card */}
              <div className="bg-secondary rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between font-sans">
                  <h2 className="font-semibold flex items-center gap-2 text-foreground">
                    <Smartphone className="h-5 w-5 text-primary" /> Active Login Sessions
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadSessions}
                    disabled={loadingSessions}
                    className="h-8 rounded-full text-xs font-bold px-3"
                  >
                    {loadingSessions ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
                    Refresh Sessions
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Below is a list of devices and sessions currently signed into your Jackpot Jungle admin account. You can log out other devices instantly.
                </p>

                <div className="space-y-3 pt-2">
                  {loadingSessions ? (
                    <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/80 rounded-xl text-center select-none">
                      <Loader2 className="h-5 w-5 text-muted-foreground animate-spin mb-2" />
                      <p className="text-xs text-muted-foreground">Loading active sessions...</p>
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/40 rounded-2xl text-center select-none bg-secondary/30">
                      <Smartphone className="h-7 w-7 text-muted-foreground/55 mb-2" />
                      <p className="text-xs font-bold text-foreground">No active sessions found</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Please refresh or verify your connection settings.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Current Device Session */}
                      {sessions.filter(s => s.id === currentSessionId).map((s) => {
                        const deviceLabel = parseUserAgent(s.user_agent);
                        const isMobile = s.user_agent?.toLowerCase().includes("iphone") || s.user_agent?.toLowerCase().includes("android");
                        return (
                          <div key={s.id} className="flex items-center justify-between p-3.5 bg-card border border-primary/30 hover:border-primary/50 rounded-xl transition-all gap-4 shadow-sm">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-9 w-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0 border border-primary/20">
                                {isMobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs font-bold text-foreground truncate">{deviceLabel}</p>
                                  <span className="bg-primary/20 border border-primary/30 text-primary text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    This Device
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                                  <span className="flex items-center gap-0.5"><Globe className="h-3 w-3" /> {s.ip || "Unknown IP"}</span>
                                  <span>•</span>
                                  <span>Last active: {new Date(s.updated_at).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Other Device Sessions */}
                      {sessions.filter(s => s.id !== currentSessionId).length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/40 rounded-2xl text-center select-none bg-secondary/30">
                          <Smartphone className="h-7 w-7 text-muted-foreground/55 mb-2" />
                          <p className="text-xs font-bold text-foreground">No other active devices found</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">You are currently logged in only on this device.</p>
                        </div>
                      ) : (
                        sessions.filter(s => s.id !== currentSessionId).map((s) => {
                          const deviceLabel = parseUserAgent(s.user_agent);
                          const isMobile = s.user_agent?.toLowerCase().includes("iphone") || s.user_agent?.toLowerCase().includes("android");
                          return (
                            <div key={s.id} className="flex items-center justify-between p-3.5 bg-card border border-border/60 hover:border-border rounded-xl transition-all gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-9 w-9 bg-secondary rounded-xl flex items-center justify-center text-primary shrink-0 border border-border/20">
                                  {isMobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-foreground truncate">{deviceLabel}</p>
                                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                                    <span className="flex items-center gap-0.5"><Globe className="h-3 w-3" /> {s.ip || "Unknown IP"}</span>
                                    <span>•</span>
                                    <span>Last active: {new Date(s.updated_at).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="destructive"
                                size="icon"
                                onClick={() => handleTerminateSession(s.id)}
                                className="h-8 w-8 rounded-lg shrink-0"
                                title="Log out device"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Member since {new Date(profile.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}

export function PushNotificationsAdminView() {
  const getTargetCountFn = useServerFn(getPushNotificationTargetCount);
  const sendPushFn = useServerFn(sendCustomPushNotificationAllUsers);

  const [title, setTitle] = useState("Jackpot Jungle 🎉");
  const [message, setMessage] = useState("");
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [sending, setSending] = useState(false);
  
  // Track currently active input field for inserting emojis
  const [activeField, setActiveField] = useState<"title" | "message">("message");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  const popularEmojis = ["🎉", "🚀", "🔥", "💎", "🎰", "🎁", "📢", "✨", "🔔", "🤑", "👑", "🍀"];

  const loadTargetCount = async () => {
    setLoadingCount(true);
    try {
      const res = await getTargetCountFn();
      setTargetCount(res.count ?? 0);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingCount(false);
    }
  };

  useEffect(() => {
    loadTargetCount();
  }, []);

  const insertEmoji = (emoji: string) => {
    if (activeField === "title") {
      setTitle(prev => prev + emoji);
      titleInputRef.current?.focus();
    } else {
      setMessage(prev => prev + emoji);
      messageInputRef.current?.focus();
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setSending(true);
    try {
      const res = await sendPushFn({ data: { title: title.trim(), message: message.trim() } });
      if (res.success) {
        toast.success(`Successfully sent push notification to ${res.sentCount} devices!`);
        setMessage("");
      } else {
        toast.error(res.error || "Failed to send push notifications");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send push notifications");
    } finally {
      setSending(false);
      loadTargetCount();
    }
  };

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6 animate-fade-in">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <span>Push Notification Broadcast</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Send a push notification with custom text and emojis directly to all registered non-admin customer devices (APKs).
        </p>
      </div>

      <div className="bg-secondary/40 border border-border/80 rounded-2xl p-5 space-y-4">
        {/* Target Audience Device Count */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border/60 text-xs">
          <span className="font-semibold text-muted-foreground">Target Audience:</span>
          {loadingCount ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Calculating devices...</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
              <Smartphone className="h-3.5 w-3.5" />
              <span>{targetCount !== null ? `${targetCount} registered device(s)` : "0 devices"}</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Notification Title
            </label>
            <Input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setActiveField("title")}
              placeholder="e.g., Jackpot Jungle Announcement! 🎉"
              className="bg-card font-medium"
              disabled={sending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Notification Message (Body)
            </label>
            <Textarea
              ref={messageInputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onFocus={() => setActiveField("message")}
              placeholder="e.g., New promotion available! Click to play now and double your credit! 🚀"
              rows={4}
              className="bg-card text-sm leading-relaxed"
              disabled={sending}
            />
          </div>

          {/* Emoji Quick Insert Tray */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Quick insert emoji ({activeField === "title" ? "Title" : "Message"})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {popularEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  disabled={sending}
                  className="h-8 w-8 text-lg flex items-center justify-center bg-card hover:bg-secondary border border-border/80 rounded-lg transition-all active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={sending || !title.trim() || !message.trim()}
            className="w-full h-11 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sending Push Broadcast...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Send Push Notification</span>
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
