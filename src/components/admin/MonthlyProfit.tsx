import React, { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProfitReportAdmin } from "@/lib/wallet.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  TrendingUp, 
  TrendingDown, 
  Coins, 
  Search, 
  Download, 
  Printer, 
  Calendar, 
  Loader2, 
  User, 
  RefreshCw, 
  DollarSign, 
  FileText
} from "lucide-react";

export function MonthlyProfitView() {
  const fetchReport = useServerFn(getProfitReportAdmin);

  // States
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDay.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState("");
  const [preset, setPreset] = useState("this_month");
  const [userSearch, setUserSearch] = useState("");
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [userSummaries, setUserSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Load report data
  const loadReport = async (start = startDate, end = endDate) => {
    setLoading(true);
    try {
      const res = await fetchReport({
        data: {
          startDate: start ? new Date(start).toISOString() : undefined,
          endDate: end ? new Date(end + "T23:59:59.999Z").toISOString() : undefined
        }
      });
      setTransactions(res.transactions ?? []);
      setUserSummaries(res.userSummaries ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load profit report");
    } finally {
      setLoading(false);
    }
  };

  // Run on mount and date changes
  useEffect(() => {
    loadReport();
  }, [startDate, endDate]);

  // Handle Preset Changes
  const setPresetRange = (presetName: string) => {
    setPreset(presetName);
    const now = new Date();
    if (presetName === "this_week") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      setStartDate(sevenDaysAgo.toISOString().split("T")[0]);
      setEndDate("");
    } else if (presetName === "this_month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().split("T")[0]);
      setEndDate("");
    } else if (presetName === "last_month") {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(firstDayLastMonth.toISOString().split("T")[0]);
      setEndDate(lastDayLastMonth.toISOString().split("T")[0]);
    } else if (presetName === "all") {
      setStartDate("");
      setEndDate("");
    }
  };

  // Client-side dynamic filtering
  const filteredTxs = transactions.filter(tx => {
    const s = userSearch.trim().toLowerCase();
    if (!s) return true;
    return tx.username.toLowerCase().includes(s) || 
           (tx.reason && tx.reason.toLowerCase().includes(s)) ||
           (tx.notes && tx.notes.toLowerCase().includes(s)) ||
           (tx.admin_name && tx.admin_name.toLowerCase().includes(s));
  });

  const filteredSummaries = userSummaries.filter(u => {
    const s = userSearch.trim().toLowerCase();
    if (!s) return true;
    return u.username.toLowerCase().includes(s) || 
           (u.first_name && u.first_name.toLowerCase().includes(s)) ||
           (u.last_name && u.last_name.toLowerCase().includes(s));
  });

  // Calculate dynamic totals based on currently filtered subset
  const cashInTotal = filteredTxs
    .filter(tx => tx.action === "cashin")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const cashOutTotal = filteredTxs
    .filter(tx => tx.action === "cashout")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const netProfit = cashInTotal - cashOutTotal;

  // Export CSV Handler
  const exportCSV = () => {
    if (filteredTxs.length === 0) return toast.error("No transactions found to export.");

    const headers = ["Date & Time", "Customer Username", "Action", "Amount", "Reason", "Admin Name", "Notes"];
    const rows = filteredTxs.map(tx => [
      new Date(tx.created_at).toLocaleString(),
      tx.username,
      tx.action.toUpperCase(),
      `${tx.action === "cashin" ? "+" : "-"}$${Number(tx.amount).toFixed(2)}`,
      tx.reason || "",
      tx.admin_name || "Admin",
      tx.notes || ""
    ]);

    // Append spacer and totals
    rows.push([]);
    rows.push(["TOTAL CASH IN", "", "", `$${cashInTotal.toFixed(2)}`]);
    rows.push(["TOTAL CASH OUT", "", "", `$${cashOutTotal.toFixed(2)}`]);
    rows.push(["NET PROFIT (IN - OUT)", "", "", `$${netProfit.toFixed(2)}`]);

    const csvContent = [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `JJ_Profit_Flow_Report_${preset.toUpperCase()}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV report exported successfully!");
  };

  // Print Statement Handler
  const printStatement = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Could not open print window.");

    const txRows = filteredTxs.map(tx => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(tx.created_at).toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">${tx.username}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold; color: ${tx.action === 'cashin' ? '#10b981' : '#ef4444'}; text-transform: uppercase;">${tx.action}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">${tx.action === 'cashin' ? '+' : '-'}$${Number(tx.amount).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.reason || ""}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.admin_name || "Admin"}</td>
      </tr>
    `).join("");

    const userRows = filteredSummaries.map(u => `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #eee;">${u.username}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #10b981; font-weight: 600;">$${u.cashIn.toFixed(2)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; color: #ef4444; font-weight: 600;">$${u.cashOut.toFixed(2)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: ${u.net >= 0 ? '#10b981' : '#ef4444'}">${u.net >= 0 ? '+' : ''}$${u.net.toFixed(2)}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Jackpot Jungle Profit Flow Report</title>
          <style>
            body { font-family: sans-serif; padding: 24px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th { background-color: #f5f5f5; text-align: left; padding: 8px; border-bottom: 2px solid #ddd; }
            .header { margin-bottom: 20px; border-bottom: 3px solid #10b981; padding-bottom: 12px; }
            .summary-box { background: #f9f9f9; padding: 14px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; }
            .col { flex: 1; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0; color: #10b981;">JACKPOT JUNGLE</h1>
            <p style="margin: 4px 0 0 0; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Monthly Profit & Cash Flow Report</p>
          </div>
          <div>
            <p style="margin: 2px 0; font-size: 13px;"><strong>Report Period:</strong> ${startDate || "All time"} to ${endDate || "Now"}</p>
            <p style="margin: 2px 0; font-size: 13px;"><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <div class="summary-box">
            <div class="col">
              <p style="margin: 3px 0;"><strong>Total Cash In:</strong> <span style="color: #10b981; font-weight: bold;">$${cashInTotal.toFixed(2)}</span></p>
              <p style="margin: 3px 0;"><strong>Total Cash Out:</strong> <span style="color: #ef4444; font-weight: bold;">$${cashOutTotal.toFixed(2)}</span></p>
            </div>
            <div class="col" style="text-align: right;">
              <h2 style="margin: 0; color: ${netProfit >= 0 ? '#10b981' : '#ef4444'}">${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)}</h2>
              <p style="margin: 2px 0; font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold;">Net Profit Flow</p>
            </div>
          </div>

          <h3 style="margin-top: 25px; margin-bottom: 5px; color: #333;">Grouped User Summaries</h3>
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th style="text-align: right;">Cash In</th>
                <th style="text-align: right;">Cash Out</th>
                <th style="text-align: right;">Net Profit</th>
              </tr>
            </thead>
            <tbody>
              ${userRows || '<tr><td colspan="4" style="text-align: center; padding: 10px;">No user aggregates found</td></tr>'}
            </tbody>
          </table>

          <h3 style="margin-top: 25px; margin-bottom: 5px; color: #333;">Detailed Transaction Ledger</h3>
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Username</th>
                <th>Action</th>
                <th style="text-align: right;">Amount</th>
                <th>Reason</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              ${txRows || '<tr><td colspan="6" style="text-align: center; padding: 10px;">No detailed records found</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Coins className="h-7 w-7 text-primary" />
            <span>Monthly Profit Overview</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track, filter, and audit administrative Cash In and Cash Out flows to calculate net profits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => loadReport()}
            disabled={loading}
            className="h-9 gap-1 font-bold text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Report
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportCSV}
            disabled={loading || filteredTxs.length === 0}
            className="h-9 gap-1 font-bold text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={printStatement}
            disabled={loading || filteredTxs.length === 0}
            className="h-9 gap-1 font-bold text-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Report
          </Button>
        </div>
      </div>

      {/* Date Presets and Date picker bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-secondary/10 p-4 rounded-2xl border border-border/40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-muted-foreground mr-1.5">Preset:</span>
          {["this_week", "this_month", "last_month", "all"].map((p) => (
            <button
              key={p}
              onClick={() => setPresetRange(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                preset === p
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-secondary/40 hover:bg-secondary text-foreground"
              }`}
            >
              {p === "this_week" && "7 Days"}
              {p === "this_month" && "This Month"}
              {p === "last_month" && "Last Month"}
              {p === "all" && "All Time"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-muted-foreground">Start:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPreset("custom");
                setStartDate(e.target.value);
              }}
              className="h-8 px-2 rounded-xl bg-secondary text-xs border border-border/50 font-medium text-foreground"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-muted-foreground">End:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPreset("custom");
                setEndDate(e.target.value);
              }}
              className="h-8 px-2 rounded-xl bg-secondary text-xs border border-border/50 font-medium text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="relative overflow-hidden bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/10 flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-500/80">Total Cash In</span>
            <div className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-500">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-black text-emerald-500 tracking-tight">
              ${cashInTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Deposits / additions logged</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-red-500/5 p-6 rounded-3xl border border-red-500/10 flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-500/80">Total Cash Out</span>
            <div className="p-2 rounded-2xl bg-red-500/10 text-red-500">
              <TrendingDown className="h-5 w-5" />
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-black text-red-500 tracking-tight">
              ${cashOutTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Wins / deductions logged</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-primary/5 p-6 rounded-3xl border border-primary/10 flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-primary/85">Net Profit Flow</span>
            <div className="p-2 rounded-2xl bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div>
            <h2 className={`text-3xl font-black tracking-tight ${netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Formula: Cash In - Cash Out</p>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* User Aggregates Section */}
        <div className="lg:col-span-1 border border-border/40 rounded-3xl bg-card/50 flex flex-col overflow-hidden h-[500px]">
          <div className="p-4 border-b border-border/30 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">User Cash Flow</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Summary sorted by Net Flow</p>
            </div>
            <div className="relative w-36">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Find customer..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="h-8 pl-8 pr-2.5 rounded-xl text-xs bg-secondary/50 border-0"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border/30 p-2 space-y-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-[10px] text-muted-foreground">Summing data...</p>
              </div>
            ) : filteredSummaries.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground text-xs font-semibold">
                No users found.
              </div>
            ) : (
              filteredSummaries.map((u) => (
                <div 
                  key={u.userId}
                  onClick={() => setUserSearch(u.username)}
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-secondary/20 transition-all cursor-pointer border border-transparent hover:border-border/30"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{u.username}</p>
                      <p className="text-[9px] text-muted-foreground">{u.first_name} {u.last_name}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`text-xs font-black ${u.net >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {u.net >= 0 ? '+' : ''}${u.net.toFixed(2)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">In: ${u.cashIn.toFixed(0)} | Out: ${u.cashOut.toFixed(0)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detailed Transactions List */}
        <div className="lg:col-span-2 border border-border/40 rounded-3xl bg-card flex flex-col overflow-hidden h-[500px]">
          <div className="p-4 border-b border-border/30 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Audit Ledger</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Logs of individual administrative entries</p>
            </div>
            {userSearch && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUserSearch("")}
                className="h-8 text-xs font-bold hover:bg-secondary rounded-xl text-primary"
              >
                Show All Users
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Querying ledger logs...</p>
              </div>
            ) : filteredTxs.length === 0 ? (
              <div className="text-center py-24">
                <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-bold text-muted-foreground">No profit flow entries</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">No administrative cash transactions logged in this range.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-secondary/40 sticky top-0 border-b border-border/30 text-[10px] text-muted-foreground uppercase tracking-wider font-bold shrink-0 z-10">
                  <tr>
                    <th className="p-3">Date & Time</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Action</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filteredTxs.map((tx) => (
                    <tr key={tx.id} className="hover:bg-secondary/10 transition-colors">
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 font-bold whitespace-nowrap">
                        {tx.username}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                          tx.action === "cashin" 
                            ? "bg-emerald-500/10 text-emerald-500" 
                            : "bg-red-500/10 text-red-500"
                        }`}>
                          {tx.action}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-black whitespace-nowrap ${
                        tx.action === "cashin" ? "text-emerald-500" : "text-destructive"
                      }`}>
                        {tx.action === "cashin" ? "+" : "-"}${Number(tx.amount).toFixed(2)}
                      </td>
                      <td className="p-3 font-medium max-w-[150px] truncate" title={tx.reason}>
                        {tx.reason}
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap font-medium">
                        {tx.admin_name || "Admin"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
