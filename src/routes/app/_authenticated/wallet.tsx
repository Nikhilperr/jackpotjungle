import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wallet, History, FileText, Download, Printer, Loader2, Coins } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getWalletHistoryUser } from "@/lib/wallet.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/app/_authenticated/wallet")({
  ssr: false,
  head: () => ({ meta: [{ title: "Wallet — JJ Messenger" }] }),
  component: WalletPage,
});

type Profile = {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  wallet_balance?: number;
  credit_balance?: number;
  wallet_deposits?: number;
  wallet_released?: number;
  wallet_used?: number;
  wallet_last_updated?: string;
};

function WalletPage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("jj_cached_my_profile");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [walletHistory, setWalletHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "wallet" | "credit">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredHistory = walletHistory.filter((tx) => {
    if (ledgerFilter !== "all") {
      const isCreditAction = ["credit_added", "credit_released", "deduct_credit", "transfer", "reset"].includes(tx.action);
      const isWalletAction = ["deposit", "deduction", "correction", "refund", "bonus", "reset"].includes(tx.action);
      if (ledgerFilter === "credit" && !isCreditAction) return false;
      if (ledgerFilter === "wallet" && !isWalletAction) return false;
    }
    if (startDate) {
      const txDate = new Date(tx.created_at);
      const limitDate = new Date(startDate + "T00:00:00");
      if (txDate < limitDate) return false;
    }
    if (endDate) {
      const txDate = new Date(tx.created_at);
      const limitDate = new Date(endDate + "T23:59:59.999");
      if (txDate > limitDate) return false;
    }
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

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    supabase.from("profiles")
      .select("id, username, first_name, last_name, wallet_balance, credit_balance, wallet_deposits, wallet_released, wallet_used, wallet_last_updated" as any)
      .eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!mounted || !data) return;
        const profileData = data as unknown as Profile;
        setProfile(profileData);
      });

    // Realtime listener for balance adjustments from admin panel
    const channel = supabase
      .channel(`wallet-balance-changes-${user.id}`)
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

    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, [user]);

  const exportUserCSV = () => {
    if (filteredHistory.length === 0) return toast.error("No transactions to export.");

    let headers: string[] = [];
    let rows: any[][] = [];

    if (ledgerFilter === "wallet") {
      headers = ["Date & Time", "Action", "Amount", "Balance Before", "Balance After", "Reason", "Notes"];
      rows = filteredHistory.map(tx => [
        new Date(tx.created_at).toLocaleString(),
        tx.action.toUpperCase(),
        `$${Number(tx.amount).toFixed(2)}`,
        `$${Number(tx.avail_before).toFixed(2)}`,
        `$${Number(tx.avail_after).toFixed(2)}`,
        tx.reason,
        tx.notes || ""
      ]);
    } else if (ledgerFilter === "credit") {
      headers = ["Date & Time", "Action", "Amount", "Credit Before", "Credit After", "Reason", "Notes"];
      rows = filteredHistory.map(tx => [
        new Date(tx.created_at).toLocaleString(),
        tx.action.toUpperCase(),
        `$${Number(tx.amount).toFixed(2)}`,
        `$${Number(tx.credit_before).toFixed(2)}`,
        `$${Number(tx.credit_after).toFixed(2)}`,
        tx.reason,
        tx.notes || ""
      ]);
    } else {
      headers = ["Date & Time", "Action", "Amount", "Avail Before", "Avail After", "Credit Before", "Credit After", "Reason", "Notes"];
      rows = filteredHistory.map(tx => [
        new Date(tx.created_at).toLocaleString(),
        tx.action.toUpperCase(),
        `$${Number(tx.amount).toFixed(2)}`,
        `$${Number(tx.avail_before).toFixed(2)}`,
        `$${Number(tx.avail_after).toFixed(2)}`,
        `$${Number(tx.credit_before).toFixed(2)}`,
        `$${Number(tx.credit_after).toFixed(2)}`,
        tx.reason,
        tx.notes || ""
      ]);
    }

    const csvContent = [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `JJ_Wallet_Statement_${ledgerFilter.toUpperCase()}_${profile?.username || "user"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV Statement exported successfully!");
  };

  const printStatement = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Could not open print window.");

    const customerName = profile?.first_name
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : profile?.username || "Valued Customer";

    // Table Headers
    let tableHeaders = "";
    let colspan = 8;
    if (ledgerFilter === "wallet") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Avail. Before</th>
        <th style="text-align: right;">Avail. After</th>
        <th>Reason</th>
      `;
      colspan = 6;
    } else if (ledgerFilter === "credit") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Credit Before</th>
        <th style="text-align: right;">Credit After</th>
        <th>Reason</th>
      `;
      colspan = 6;
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
      `;
      colspan = 8;
    }

    const txRows = filteredHistory.map(tx => {
      let cells = `
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(tx.created_at).toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-transform: uppercase; font-weight: bold;">${tx.action}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.amount).toFixed(2)}</td>
      `;

      if (ledgerFilter === "wallet") {
        cells += `
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_after).toFixed(2)}</td>
        `;
      } else if (ledgerFilter === "credit") {
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
      `;

      return `<tr>${cells}</tr>`;
    }).join("");

    // Summary block
    let summaryHTML = "";
    if (ledgerFilter === "wallet") {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Available Balance:</strong> $${(profile?.wallet_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Total Deposited:</strong> $${(profile?.wallet_deposits ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Total Used:</strong> $${(profile?.wallet_used ?? 0).toFixed(2)}</p>
        </div>
      `;
    } else if (ledgerFilter === "credit") {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Credit Balance:</strong> $${(profile?.credit_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Total Released:</strong> $${(profile?.wallet_released ?? 0).toFixed(2)}</p>
        </div>
      `;
    } else {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Available Balance:</strong> $${(profile?.wallet_balance ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Credit Balance:</strong> $${(profile?.credit_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Total Deposited:</strong> $${(profile?.wallet_deposits ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Total Released:</strong> $${(profile?.wallet_released ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Total Used:</strong> $${(profile?.wallet_used ?? 0).toFixed(2)}</p>
        </div>
      `;
    }

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
        <div className="p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold">Wallet</h1>
        </div>

        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          <div className="bg-secondary rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2 text-foreground">
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

            <div className="pt-2 border-t border-border/40">
              <Link
                to="/app/deposit"
                className="w-full h-11 bg-primary text-primary-foreground font-black rounded-full text-xs flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-md cursor-pointer select-none"
              >
                <Coins className="h-4.5 w-4.5" />
                <span>Deposit with Crypto</span>
              </Link>
            </div>
          </div>
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

          <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/35 p-3 rounded-xl border border-border/40 my-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">Type:</span>
                <select
                  value={ledgerFilter}
                  onChange={(e) => setLedgerFilter(e.target.value as any)}
                  className="bg-card text-foreground text-xs font-bold px-2 py-1 rounded border border-border focus:outline-none cursor-pointer h-8"
                >
                  <option value="all">All</option>
                  <option value="wallet">Wallet Only</option>
                  <option value="credit">Credit Only</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">Start:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 px-2 rounded bg-card text-xs border border-border/50 font-medium text-foreground dark:text-foreground"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">End:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 px-2 rounded bg-card text-xs border border-border/50 font-medium text-foreground dark:text-foreground"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  className="text-xs font-bold text-destructive hover:underline"
                >
                  Clear dates
                </button>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={exportUserCSV} className="rounded-full text-xs font-bold gap-1.5 h-8 shrink-0">
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
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tx.action === "deposit" || tx.action === "refund" || tx.action === "bonus"
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

          <div className="flex items-center gap-2 bg-secondary/35 p-3 rounded-xl border border-border/40 my-1">
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Start:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 px-2 rounded bg-card text-xs border border-border/50 font-medium text-foreground dark:text-foreground w-full"
              />
            </div>
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">End:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 px-2 rounded bg-card text-xs border border-border/50 font-medium text-foreground dark:text-foreground w-full"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="text-[10px] font-bold text-destructive hover:underline shrink-0"
              >
                Clear
              </button>
            )}
          </div>

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
