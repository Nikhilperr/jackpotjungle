import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Avatar } from "@/components/messenger/Avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Camera, Loader2, Bell, BellOff, Wallet, History, FileText, Download, Printer, CheckCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { getWalletHistoryUser } from "@/lib/wallet.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/app/_authenticated/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "Profile — JJ Messenger" }] }),
  component: ProfilePage,
});

type Profile = {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  friend_code: string;
  referral_code: string;
  avatar_url: string | null;
  created_at: string;
  wallet_balance?: number;
  credit_balance?: number;
  wallet_deposits?: number;
  wallet_released?: number;
  wallet_used?: number;
  wallet_last_updated?: string;
};

function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [walletHistory, setWalletHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "wallet" | "credit">("all");

  const filteredHistory = walletHistory.filter((tx) => {
    if (ledgerFilter === "all") return true;
    const isCreditAction = ["credit_added", "credit_released", "deduct_credit", "transfer", "reset"].includes(tx.action);
    const isWalletAction = ["deposit", "deduction", "correction", "refund", "bonus", "reset"].includes(tx.action);
    if (ledgerFilter === "credit") return isCreditAction;
    if (ledgerFilter === "wallet") return isWalletAction;
    return true;
  });

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await getWalletHistoryUser();
      setWalletHistory(data ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load wallet transaction history");
    } finally {
      setLoadingHistory(false);
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const email = user?.email ?? null;
  const isGoogle = user?.app_metadata?.provider === "google" || user?.identities?.some((id: any) => id.provider === "google");

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    supabase.from("profiles")
      .select("id, username, first_name, last_name, avatar_url, friend_code, referral_code, created_at, notif_enabled, wallet_balance, credit_balance, wallet_deposits, wallet_released, wallet_used, wallet_last_updated" as any)
      .eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!mounted || !data) return;
        setProfile(data as unknown as Profile);
        setUsername((data as any).username);
        setFirstName((data as any).first_name ?? "");
        setLastName((data as any).last_name ?? "");
        setNotifEnabled((data as any).notif_enabled ?? true);
      });

    // Realtime listener for balance adjustments from admin panel
    const channel = supabase
      .channel(`profile-wallet-changes-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && mounted) {
            setProfile((prev) => prev ? { ...prev, ...(payload.new as Profile) } : null);
          }
        }
      )
      .subscribe();

    if (typeof window !== "undefined" && "Notification" in window) setPermission(Notification.permission);
    return () => { 
      mounted = false; 
      channel.unsubscribe();
    };
  }, [user]);

  async function toggleNotif(v: boolean) {
    if (!profile) return;
    setNotifEnabled(v);
    await supabase.from("profiles").update({ notif_enabled: v } as any).eq("id", profile.id);
    if (v && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      const p = await Notification.requestPermission();
      setPermission(p);
    }
  }

  async function requestPerm() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") toast.success("Browser notifications enabled.");
  }


  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ 
      username,
      first_name: firstName.trim(),
      last_name: lastName.trim()
    }).eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { 
      toast.success("Profile updated."); 
      setProfile({ 
        ...profile, 
        username,
        first_name: firstName.trim(),
        last_name: lastName.trim()
      }); 
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile) return;

    // Static image validation
    const fileMime = file.type.toLowerCase();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (fileMime === "image/gif" || ext === "gif") {
      return toast.error("GIF files are not supported. Please choose a static image.");
    }
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    const allowedExts = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
    if (!allowedMimes.includes(fileMime) && !allowedExts.includes(ext)) {
      return toast.error("Unsupported format. Please choose a JPEG, PNG, WEBP, or HEIC image.");
    }

    if (file.size > 5 * 1024 * 1024) return toast.error("Max 5MB.");
    setUploading(true);
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("avatars", profile.id, file, ext, file.type);
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
      if (updErr) throw updErr;
      setProfile({ ...profile, avatar_url: url });
      toast.success("Profile picture updated.");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    }
    setUploading(false);
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  const exportUserCSV = () => {
    if (filteredHistory.length === 0) return toast.error("No transactions to export.");
    const headers = ["Date & Time", "Action", "Amount", "Balance Before", "Balance After", "Reason", "Notes"];
    const rows = filteredHistory.map(tx => [
      new Date(tx.created_at).toLocaleString(),
      tx.action.toUpperCase(),
      `$${Number(tx.amount).toFixed(2)}`,
      `$${Number(tx.avail_before).toFixed(2)}`,
      `$${Number(tx.avail_after).toFixed(2)}`,
      tx.reason,
      tx.notes || ""
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `JJ_Wallet_Statement_${profile?.username || "user"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV Statement exported successfully!");
  };

  const printStatement = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Could not open print window.");
    
    const customerName = profile?.first_name 
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : profile?.username || "Valued Customer";
      
    const txRows = filteredHistory.map(tx => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(tx.created_at).toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-transform: uppercase; font-weight: bold;">${tx.action}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.amount).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_before).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_after).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.reason}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Jackpot Jungle Ledger Statement</title>
          <style>
            body { font-family: sans-serif; padding: 24px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f5f5f5; text-align: left; padding: 8px; border-bottom: 2px solid #ddd; }
            .header { margin-bottom: 30px; border-bottom: 3px solid #10b981; padding-bottom: 16px; }
            .summary { background: #f9f9f9; padding: 16px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0; color: #10b981;">JACKPOT JUNGLE</h1>
            <p style="margin: 4px 0 0 0; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Wallet credit ledger statement</p>
          </div>
          <div>
            <h3 style="margin: 0;">Customer Name: ${customerName}</h3>
            <p style="margin: 4px 0; font-size: 13px;">Username: @${profile?.username}</p>
            <p style="margin: 4px 0; font-size: 13px;">Statement generated: ${new Date().toLocaleString()}</p>
          </div>
          <div class="summary" style="display: flex; justify-content: space-between; margin-top: 20px;">
            <div>
              <p style="margin: 4px 0;"><strong>Available Balance:</strong> $${(profile?.wallet_balance ?? 0).toFixed(2)}</p>
              <p style="margin: 4px 0;"><strong>Credit Balance:</strong> $${(profile?.credit_balance ?? 0).toFixed(2)}</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 4px 0;"><strong>Total Deposited:</strong> $${(profile?.wallet_deposits ?? 0).toFixed(2)}</p>
              <p style="margin: 4px 0;"><strong>Total Released:</strong> $${(profile?.wallet_released ?? 0).toFixed(2)}</p>
              <p style="margin: 4px 0;"><strong>Total Used:</strong> $${(profile?.wallet_used ?? 0).toFixed(2)}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Action</th>
                <th style="text-align: right;">Amount</th>
                <th style="text-align: right;">Avail. Before</th>
                <th style="text-align: right;">Avail. After</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              \${txRows || '<tr><td colspan="6" style="text-align: center; padding: 20px;">No transaction records found.</td></tr>'}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (authLoading || !profile) {
    return (
      <AppShell>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="md:hidden p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold">Profile</h1>
        </div>
        <div className="max-w-xl mx-auto p-6 space-y-6">
          <div className="flex flex-col items-center text-center pt-4">
            <div className="relative">
              <Avatar name={profile.username} url={profile.avatar_url} size={96} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 disabled:opacity-50"
                aria-label="Change profile picture"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickFile}
                className="hidden"
              />
            </div>
            <h1 className="mt-4 text-2xl font-bold">
              {profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username}
            </h1>
            <p className="text-xs text-muted-foreground font-semibold">@{profile.username}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{email}</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="mt-2 text-xs text-primary hover:underline disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Change profile picture"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CodeCard label="Friend code" value={profile.friend_code} onCopy={() => copy(profile.friend_code, "Friend code")} />
            <CodeCard label="Referral code" value={profile.referral_code} onCopy={() => copy(profile.referral_code, "Referral code")} />
          </div>

          <form onSubmit={save} className="bg-secondary rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">Edit profile</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fn">First Name</Label>
                <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="bg-card" />
              </div>
              <div>
                <Label htmlFor="ln">Last Name</Label>
                <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} className="bg-card" />
              </div>
            </div>
            <div>
              <Label htmlFor="u">Username</Label>
              <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-card" />
            </div>
            <Button type="submit" disabled={saving || (username === profile.username && firstName === (profile.first_name ?? "") && lastName === (profile.last_name ?? ""))} className="rounded-full">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>

          {isGoogle && (
            <div className="bg-secondary/40 border border-border/80 rounded-2xl p-5 space-y-2 text-xs text-muted-foreground select-none">
              <p className="font-semibold text-foreground">Password Management</p>
              <p className="leading-relaxed">
                This account uses Google Sign-In. Password management is handled through your Google account.
              </p>
            </div>
          )}

          <div className="bg-secondary rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              {notifEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} Notifications
            </h2>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">New message alerts</p>
                <p className="text-xs text-muted-foreground">Get notified when someone messages you.</p>
              </div>
              <Switch checked={notifEnabled} onCheckedChange={toggleNotif} />
            </div>
            {notifEnabled && permission !== "granted" && (
              <Button type="button" variant="outline" size="sm" onClick={requestPerm} className="rounded-full">
                {permission === "denied" ? "Notifications blocked in browser" : "Enable browser notifications"}
              </Button>
            )}
          </div>



          {/* Premium Wallet Credit System Card */}
          <div className="bg-secondary rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" /> Premium Wallet Ledger
              </h2>
              <div className="text-[10px] text-muted-foreground uppercase bg-card/65 border border-border px-2 py-0.5 rounded-full font-bold select-none">
                Owner Only
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-card border border-border/80 rounded-xl p-3.5 flex flex-col justify-between">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Available Balance</p>
                <p className="text-xl font-black text-green-500 mt-1">${(profile.wallet_balance ?? 0).toFixed(2)}</p>
              </div>
              
              <div className="bg-card border border-border/80 rounded-xl p-3.5 flex flex-col justify-between">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Credit Balance</p>
                <p className="text-xl font-black text-amber-500 mt-1">${(profile.credit_balance ?? 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-2 border-t border-border/60 pt-3 text-xs">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Total Deposited:</span>
                <span className="font-semibold text-foreground">${(profile.wallet_deposits ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Total Released From Credit:</span>
                <span className="font-semibold text-foreground">${(profile.wallet_released ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground font-medium border-t border-border/40 pt-2 text-foreground">
                <span>Total Used / Deducted:</span>
                <span className="text-red-500 font-bold">${(profile.wallet_used ?? 0).toFixed(2)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground text-right mt-1 font-semibold">
                Last updated: {profile.wallet_last_updated ? new Date(profile.wallet_last_updated).toLocaleString() : "Never"}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-border/60">
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  fetchHistory();
                  setHistoryOpen(true);
                }} 
                className="flex-1 rounded-full gap-1.5 h-10 font-bold text-xs"
              >
                <History className="h-3.5 w-3.5" />
                History Ledger
              </Button>
              
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  fetchHistory();
                  setStatementOpen(true);
                }} 
                className="flex-1 rounded-full gap-1.5 h-10 font-bold text-xs"
              >
                <FileText className="h-3.5 w-3.5" />
                Statement
              </Button>
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Member since {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Transaction History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <History className="h-5 w-5 text-primary" /> Wallet Transaction History
            </DialogTitle>
            <DialogDescription>
              A full ledger of your wallet transactions, deposits, and released credits.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-between items-center gap-2 my-2">
            <select
              value={ledgerFilter}
              onChange={(e) => setLedgerFilter(e.target.value as any)}
              className="bg-secondary text-foreground text-xs font-bold px-3 py-1.5 rounded-full border border-border focus:outline-none cursor-pointer"
            >
              <option value="all">All Transactions</option>
              <option value="wallet">Wallet Balance Only</option>
              <option value="credit">Credit Balance Only</option>
            </select>
            <Button size="sm" variant="outline" onClick={exportUserCSV} className="rounded-full text-xs font-bold gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto border border-border/80 rounded-xl bg-secondary/20">
            {loadingHistory ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center text-muted-foreground text-center p-4">
                <Wallet className="h-8 w-8 opacity-40 mb-2" />
                <p className="text-sm font-semibold">No transactions found matching this filter.</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/80 bg-secondary/50 text-muted-foreground font-bold">
                      <th className="p-3">Date & Time</th>
                      <th className="p-3">Action</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-right">Avail Before</th>
                      <th className="p-3 text-right">Avail After</th>
                      <th className="p-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((tx) => (
                      <tr key={tx.id} className="border-b border-border/40 hover:bg-secondary/40">
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            tx.action === "deposit" || tx.action === "refund" || tx.action === "bonus"
                              ? "bg-green-500/10 text-green-500"
                              : tx.action === "credit_added" || tx.action === "credit_released"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-red-500/10 text-red-500"
                          }`}>
                            {tx.action.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-foreground">
                          ${Number(tx.amount).toFixed(2)}
                        </td>
                        <td className="p-3 text-right text-muted-foreground">
                          ${Number(tx.avail_before).toFixed(2)}
                        </td>
                        <td className="p-3 text-right text-foreground font-semibold">
                          ${Number(tx.avail_after).toFixed(2)}
                        </td>
                        <td className="p-3 max-w-[150px] truncate text-muted-foreground" title={tx.reason}>
                          {tx.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Statement Dialog */}
      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <FileText className="h-5 w-5 text-primary" /> Wallet Statement
            </DialogTitle>
            <DialogDescription>
              Preview and print your financial wallet ledger statement.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto border border-border/80 rounded-xl p-4 space-y-4 bg-secondary/10">
            <div className="border-b border-green-500 pb-2">
              <h3 className="text-sm font-black text-green-500 uppercase tracking-widest">Jackpot Jungle</h3>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">Wallet Credit Statement</p>
            </div>
            
            <div className="text-xs space-y-1">
              <p className="font-bold">Customer: <span className="font-normal text-muted-foreground">
                {profile.first_name ? `${profile.first_name} ${profile.last_name || ""}`.trim() : profile.username} (@{profile.username})
              </span></p>
              <p className="font-bold">Generated: <span className="font-normal text-muted-foreground">{new Date().toLocaleString()}</span></p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-y border-border/60 py-2.5">
              <div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase">Available Balance</p>
                <p className="font-bold text-green-500 text-sm mt-0.5">${(profile.wallet_balance ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase">Credit Balance</p>
                <p className="font-bold text-amber-500 text-sm mt-0.5">${(profile.credit_balance ?? 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-bold text-muted-foreground text-[10px] uppercase tracking-wider">Summary Stats</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Lifetime Deposits:</span>
                <span className="font-semibold">${(profile.wallet_deposits ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Released Credit:</span>
                <span className="font-semibold">${(profile.wallet_released ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Wallet Spent:</span>
                <span className="font-semibold text-red-500">${(profile.wallet_used ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4 shrink-0">
            <Button className="flex-1 rounded-full gap-1.5 h-11 font-bold" onClick={printStatement}>
              <Printer className="h-4 w-4" /> Print Statement
            </Button>
            <Button variant="outline" className="flex-1 rounded-full gap-1.5 h-11 font-bold" onClick={exportUserCSV}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CodeCard({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <button onClick={onCopy} className="bg-secondary rounded-2xl p-4 text-left hover:bg-accent transition-colors group">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>
      <p className="font-mono font-bold mt-1">{value}</p>
    </button>
  );
}
