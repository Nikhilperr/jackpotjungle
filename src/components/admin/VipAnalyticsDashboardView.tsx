import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Coins,
  Users,
  Award,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  AlertCircle,
  TrendingDown,
  Percent,
  Layers,
  FileSpreadsheet,
  FileText,
  ShieldAlert,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { getVipDashboardStats, getVipReportsData } from "@/lib/api/vip-reward-engine/dashboard.functions";
import { exportVipReportData } from "@/lib/api/vip-reward-engine/export.service";

interface VipAnalyticsDashboardViewProps {
  isSuperAdmin: boolean;
}

export default function VipAnalyticsDashboardView({ isSuperAdmin }: VipAnalyticsDashboardViewProps) {
  const [activeMonth, setActiveMonth] = useState<number>(new Date().getMonth() + 1);
  const [activeYear, setActiveYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [chartsData, setChartsData] = useState<any[]>([]);
  const [subTab, setSubTab] = useState<"analytics" | "reports">("analytics");

  // Search & Pagination States
  const [searchQuery, setSearchQuery] = useState("");
  const [vipFilter, setVipFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // Report download states
  const [downloading, setDownloading] = useState<string | null>(null);
  const [repMonth, setRepMonth] = useState<number>(new Date().getMonth() + 1);
  const [repYear, setRepYear] = useState<number>(new Date().getFullYear());
  const [repVipStatus, setRepVipStatus] = useState<string>("all");

  const months = [
    { value: 1, name: "January" },
    { value: 2, name: "February" },
    { value: 3, name: "March" },
    { value: 4, name: "April" },
    { value: 5, name: "May" },
    { value: 6, name: "June" },
    { value: 7, name: "July" },
    { value: 8, name: "August" },
    { value: 9, name: "September" },
    { value: 10, name: "October" },
    { value: 11, name: "November" },
    { value: 12, name: "December" },
  ];

  const years = [2024, 2025, 2026, 2027];

  useEffect(() => {
    fetchStats();
  }, [activeMonth, activeYear]);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = (await getVipDashboardStats({ data: { month: activeMonth, year: activeYear } })) as any;
      if (res.success) {
        setStats(res.stats);
        setChartsData(res.chartsData || []);
      } else {
        console.error("Failed to load statistics:", res.error);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setLoading(false);
    }
  }

  // Handle Report Downloads
  async function triggerReportDownload(reportType: "monthly_reward" | "vip" | "referral" | "distribution" | "qualification", format: "csv" | "excel" | "pdf") {
    const reportKey = `${reportType}_${format}`;
    setDownloading(reportKey);
    try {
      const res = (await getVipReportsData({
        data: {
          type: reportType,
          month: repMonth,
          year: repYear,
          vipStatus: repVipStatus,
        }
      })) as any;

      if (res.success && res.headers && res.rows) {
        exportVipReportData(
          res.reportName || "VIP Report",
          res.headers,
          res.rows,
          format,
          res.reportName || "vip_report"
        );
      } else {
        alert("Failed to export report: " + (res.error || "No data returned."));
      }
    } catch (err: any) {
      alert("Error generating report: " + err.message);
    } finally {
      setDownloading(null);
    }
  }

  // VIP Colors for distribution charts
  const VIP_COLORS: Record<string, string> = {
    bronze: "#b45309",
    silver: "#9ca3af",
    gold: "#fbbf24",
    platinum: "#38bdf8",
    diamond: "#a855f7",
    black_diamond: "#f43f5e",
    none: "#4b5563",
  };

  const getVipColorList = (data: any[]) => {
    return data.map(entry => VIP_COLORS[entry.name.toLowerCase().replace(/[\s-]+/g, "_")] || "#10b981");
  };

  // Process VIP Data for Pie Chart
  const vipChartData = stats?.vipStats
    ? Object.keys(stats.vipStats)
        .map(key => ({
          name: key.toUpperCase().replace("_", " "),
          value: stats.vipStats[key] || 0,
        }))
        .filter(item => item.value > 0)
    : [];

  // Filter player details (used by Admins/Super Admins to verify qualifications)
  const playersList = stats?.controlsSummary?.activeRunId
    ? (chartsData.find(c => c.month === activeMonth && c.year === activeYear) ? [] : [])
    : []; 

  // Safely parse local run results for listing
  const playerResults: any[] = stats?.controlsSummary?.activeRunId 
    ? [] // will be hydrated below
    : [];

  const rawPlayerResults = stats?.playerStats ? [] : []; 

  return (
    <div className="w-full space-y-6 text-left pb-12 animate-in fade-in duration-300">
      
      {/* Header & Sub-Tabs */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" /> VIP & Loyalty Analytics
          </h1>
          <p className="text-xs text-muted-foreground">
            {isSuperAdmin 
              ? "Super Admin executive financials, monthly growth trends, and reward pool calculations." 
              : "Admin dashboard, qualified player indexes, referral counts, and audit reviews."}
          </p>
        </div>

        {/* Date Selector controls */}
        <div className="flex flex-wrap items-center gap-2 bg-secondary/30 p-1.5 rounded-xl border border-border/60">
          <button
            onClick={() => setSubTab("analytics")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              subTab === "analytics"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Executive Analytics
          </button>
          <button
            onClick={() => setSubTab("reports")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              subTab === "reports"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Export Reports
          </button>
          
          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block"></div>
          
          <select
            value={activeMonth}
            onChange={(e) => setActiveMonth(Number(e.target.value))}
            className="bg-transparent border-0 text-xs font-bold text-foreground focus:ring-0 cursor-pointer"
          >
            {months.map(m => (
              <option key={m.value} value={m.value} className="bg-background text-foreground">{m.name}</option>
            ))}
          </select>

          <select
            value={activeYear}
            onChange={(e) => setActiveYear(Number(e.target.value))}
            className="bg-transparent border-0 text-xs font-bold text-foreground focus:ring-0 cursor-pointer"
          >
            {years.map(y => (
              <option key={y} value={y} className="bg-background text-foreground">{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col h-64 items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Calculating statistics and charts data...</p>
        </div>
      ) : (
        <>
          {subTab === "analytics" ? (
            <div className="space-y-6">
              
              {/* Executive Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Available only to Super Admin */}
                {isSuperAdmin && stats?.financials ? (
                  <>
                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                      <div className="absolute right-0 top-0 h-24 w-24 bg-primary/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Monthly Deposits</p>
                      <h3 className="text-2xl font-black text-foreground mt-2 font-mono">
                        ${stats.financials.monthlyDeposits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h3>
                      <p className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1 mt-1.5">
                        <TrendingUp className="h-3 w-3" /> Cashflow deposits count
                      </p>
                    </div>

                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                      <div className="absolute right-0 top-0 h-24 w-24 bg-rose-500/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Monthly Cashouts</p>
                      <h3 className="text-2xl font-black text-foreground mt-2 font-mono">
                        ${stats.financials.monthlyCashouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h3>
                      <p className="text-[9px] text-rose-400 font-semibold flex items-center gap-1 mt-1.5">
                        <TrendingDown className="h-3 w-3" /> Player withdrawals sum
                      </p>
                    </div>

                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                      <div className="absolute right-0 top-0 h-24 w-24 bg-blue-500/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Monthly Holding</p>
                      <h3 className={`text-2xl font-black mt-2 font-mono ${stats.financials.monthlyHolding >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ${stats.financials.monthlyHolding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h3>
                      <p className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1 mt-1.5">
                        <Layers className="h-3 w-3" /> Net cash holding
                      </p>
                    </div>

                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                      <div className="absolute right-0 top-0 h-24 w-24 bg-emerald-500/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Reward Pool Allocation</p>
                      <h3 className="text-2xl font-black text-emerald-400 mt-2 font-mono">
                        ${stats.financials.rewardPool.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h3>
                      <p className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1 mt-1.5">
                        <Percent className="h-3 w-3" /> Allocated loyalty share
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Admin Mode - Show Qualified Counts / Referrals */}
                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Qualified VIP Players</p>
                      <h3 className="text-2xl font-black text-foreground mt-2 font-mono">{stats?.playerStats?.qualified || 0}</h3>
                      <p className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1 mt-1.5">
                        <Users className="h-3 w-3" /> Eligible for reward shares
                      </p>
                    </div>

                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Disqualified Players</p>
                      <h3 className="text-2xl font-black text-foreground mt-2 font-mono">{stats?.playerStats?.disqualified || 0}</h3>
                      <p className="text-[9px] text-rose-400 font-semibold flex items-center gap-1 mt-1.5">
                        <ShieldAlert className="h-3 w-3" /> Below threshold rules
                      </p>
                    </div>

                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">New Registrations</p>
                      <h3 className="text-2xl font-black text-foreground mt-2 font-mono">{stats?.playerStats?.newPlayers || 0}</h3>
                      <p className="text-[9px] text-blue-400 font-semibold flex items-center gap-1 mt-1.5">
                        <TrendingUp className="h-3 w-3" /> Joined in active period
                      </p>
                    </div>

                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pending Reviews</p>
                      <h3 className="text-2xl font-black text-amber-400 mt-2 font-mono">{stats?.controlsSummary?.pendingReviews || 0}</h3>
                      <p className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1 mt-1.5">
                        <Calendar className="h-3 w-3" /> Runs awaiting approval
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Reward Statistics Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Average User Payout</p>
                    <h4 className="text-xl font-bold text-foreground mt-1 font-mono">${stats?.rewardStats?.average || 0}</h4>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
                    <Award className="h-5 w-5 text-primary" />
                  </div>
                </div>

                <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Highest Distributed Reward</p>
                    <h4 className="text-xl font-bold text-emerald-400 mt-1 font-mono">${stats?.rewardStats?.highest || 0}</h4>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                  </div>
                </div>

                <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Lowest Distributed Reward</p>
                    <h4 className="text-xl font-bold text-foreground mt-1 font-mono">${stats?.rewardStats?.lowest || 0}</h4>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
                    <Award className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* Super Admin Charts Block */}
              {isSuperAdmin && chartsData.length > 0 && (
                <div className="space-y-6">
                  <h3 className="text-sm font-black text-foreground uppercase tracking-wider border-b border-border/30 pb-2">Financial & Distribution Trends</h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Monthly Deposits Trend */}
                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase mb-4">Monthly Deposits & Cashouts</h4>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartsData}>
                            <defs>
                              <linearGradient id="colorDeposits" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="label" stroke="#71717a" fontSize={10} />
                            <YAxis stroke="#71717a" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                            <Legend fontSize={10} />
                            <Area type="monotone" dataKey="deposits" name="Deposits" stroke="#10b981" fillOpacity={1} fill="url(#colorDeposits)" />
                            <Area type="monotone" dataKey="cashouts" name="Cashouts" stroke="#f43f5e" fillOpacity={0} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Monthly Holding Trend */}
                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase mb-4">Monthly Holding (Net Capital Contribution)</h4>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="label" stroke="#71717a" fontSize={10} />
                            <YAxis stroke="#71717a" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                            <Legend />
                            <Bar dataKey="holding" name="Net Holding" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Reward Pool vs Distributed Rewards */}
                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase mb-4">Reward Pool Sizing vs Actual Payouts</h4>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="label" stroke="#71717a" fontSize={10} />
                            <YAxis stroke="#71717a" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                            <Legend />
                            <Line type="step" dataKey="rewardPool" name="Target Pool" stroke="#a855f7" strokeWidth={2} dot={{ r: 4 }} />
                            <Line type="monotone" dataKey="distributedRewards" name="Actual Distributed" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* VIP Distribution concentration */}
                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase mb-4">VIP Levels Concentration (All Members)</h4>
                      <div className="h-64 flex flex-col sm:flex-row items-center justify-center gap-4">
                        {vipChartData.length > 0 ? (
                          <>
                            <div className="h-48 w-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={vipChartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={65}
                                    paddingAngle={3}
                                    dataKey="value"
                                  >
                                    {vipChartData.map((entry, idx) => (
                                      <Cell key={`cell-${idx}`} fill={VIP_COLORS[entry.name.toLowerCase().replace(/\s+/g, "_")] || "#10b981"} />
                                    ))}
                                  </Pie>
                                  <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="space-y-1.5 text-xs text-muted-foreground min-w-[120px]">
                              {vipChartData.map((entry, idx) => (
                                <div key={entry.name} className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: VIP_COLORS[entry.name.toLowerCase().replace(/\s+/g, "_")] || "#10b981" }}
                                  ></span>
                                  <span className="font-semibold text-foreground">{entry.name}</span>
                                  <span className="font-mono">({entry.value})</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground">No VIP segment distributions found.</div>
                        )}
                      </div>
                    </div>

                    {/* Monthly Growth Trend */}
                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase mb-4">Payout Month-on-Month Growth (%)</h4>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="label" stroke="#71717a" fontSize={10} />
                            <YAxis stroke="#71717a" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                            <Legend />
                            <Line type="monotone" dataKey="growthRate" name="Growth Rate %" stroke="#f59e0b" strokeWidth={2} activeDot={{ r: 8 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Reward Distribution Counts */}
                    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase mb-4">Qualified Player Count History</h4>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="label" stroke="#71717a" fontSize={10} />
                            <YAxis stroke="#71717a" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                            <Legend />
                            <Bar dataKey="qualifiedPlayers" name="Qualified Users" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Recent Activity / Calculations Details (Admin and Super Admin view) */}
              <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-5 border-b border-border/60 flex items-center justify-between">
                  <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" /> Monthly Calculations Summary ({activeMonth}/{activeYear})
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    stats?.controlsSummary?.activeRunStatus === "Completed" || stats?.controlsSummary?.activeRunStatus === "Locked"
                      ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                      : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                  }`}>
                    {stats?.controlsSummary?.activeRunStatus || "No run records"}
                  </span>
                </div>

                <div className="p-6">
                  {stats?.controlsSummary?.activeRunId ? (
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Select report tab to download detailed player qualification audits, multipliers breakdown, and payout Excel sheets for the active calculation period.
                      </p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                        <div className="p-3 bg-secondary/30 rounded-xl border border-border/60">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Target Month</span>
                          <span className="text-sm font-bold text-foreground mt-1 block">{months.find(m => m.value === activeMonth)?.name} {activeYear}</span>
                        </div>
                        <div className="p-3 bg-secondary/30 rounded-xl border border-border/60">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Qualified Users</span>
                          <span className="text-sm font-bold text-foreground mt-1 block">{stats?.playerStats?.qualified} players</span>
                        </div>
                        <div className="p-3 bg-secondary/30 rounded-xl border border-border/60">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Allocated Pool</span>
                          <span className="text-sm font-bold text-emerald-400 mt-1 block">${isSuperAdmin ? stats?.financials?.rewardPool : "---"}</span>
                        </div>
                        <div className="p-3 bg-secondary/30 rounded-xl border border-border/60">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Actual Distributed</span>
                          <span className="text-sm font-bold text-foreground mt-1 block">${isSuperAdmin ? stats?.financials?.totalDistributedRewards : "---"}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-32 flex-col items-center justify-center text-muted-foreground text-center p-6 bg-secondary/5 border border-dashed border-border rounded-xl">
                      <AlertCircle className="h-6 w-6 opacity-30 mb-1" />
                      <p className="text-xs font-bold text-foreground">No reward run calculated</p>
                      <p className="text-[10px] mt-0.5 max-w-sm">No monthly calculation or simulation run exists for this period. A Super Admin must initiate calculations in VIP settings.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            /* Reports Tab Panel */
            <div className="space-y-6">
              
              <div className="bg-secondary/20 border border-border/80 rounded-2xl p-5 space-y-2">
                <h3 className="font-bold text-sm text-foreground">Document Exporters Panel</h3>
                <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                  Generate and download detailed VIP Loyalty program reports. PDF prints are optimized for printers and local auditing. Excel (.xls XML sheets) and CSV exports are raw structured data formats.
                </p>
              </div>

              {/* Reports Export Table Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Monthly Reward Report Card */}
                <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Monthly Reward Cycles Report
                    </h4>
                    <p className="text-xs text-muted-foreground">Summarized overview metrics of all reward calculations, pool values, distributed amounts, and statuses.</p>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      disabled={downloading !== null}
                      onClick={() => triggerReportDownload("monthly_reward", "csv")}
                      className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                    >
                      {downloading === "monthly_reward_csv" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} CSV
                    </button>
                    <button
                      disabled={downloading !== null}
                      onClick={() => triggerReportDownload("monthly_reward", "excel")}
                      className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                    >
                      {downloading === "monthly_reward_excel" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />} EXCEL
                    </button>
                    <button
                      disabled={downloading !== null}
                      onClick={() => triggerReportDownload("monthly_reward", "pdf")}
                      className="px-2.5 py-1.5 rounded bg-primary hover:opacity-90 text-[10px] font-bold text-primary-foreground transition-all flex items-center gap-1.5 ml-auto"
                    >
                      {downloading === "monthly_reward_pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} PRINT PDF
                    </button>
                  </div>
                </div>

                {/* 2. VIP Tiers Concentration Report Card */}
                <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-400" /> VIP Status Tiers Report
                    </h4>
                    <p className="text-xs text-muted-foreground">List of active player profiles grouped/filtered by VIP rank (Bronze, Silver, Gold, Platinum, Diamond, Black Diamond).</p>
                  </div>
                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Filter Level:</span>
                      <select
                        value={repVipStatus}
                        onChange={(e) => setRepVipStatus(e.target.value)}
                        className="bg-secondary/40 border border-border/80 rounded text-[10px] px-2 py-0.5 text-foreground cursor-pointer"
                      >
                        <option value="all">All VIP Members</option>
                        <option value="bronze">Bronze</option>
                        <option value="silver">Silver</option>
                        <option value="gold">Gold</option>
                        <option value="platinum">Platinum</option>
                        <option value="diamond">Diamond</option>
                        <option value="black_diamond">Black Diamond</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={downloading !== null}
                        onClick={() => triggerReportDownload("vip", "csv")}
                        className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                      >
                        {downloading === "vip_csv" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} CSV
                      </button>
                      <button
                        disabled={downloading !== null}
                        onClick={() => triggerReportDownload("vip", "excel")}
                        className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                      >
                        {downloading === "vip_excel" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />} EXCEL
                      </button>
                      <button
                        disabled={downloading !== null}
                        onClick={() => triggerReportDownload("vip", "pdf")}
                        className="px-2.5 py-1.5 rounded bg-primary hover:opacity-90 text-[10px] font-bold text-primary-foreground transition-all flex items-center gap-1.5 ml-auto"
                      >
                        {downloading === "vip_pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} PRINT PDF
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Referral Report Card */}
                <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <Award className="h-4 w-4 text-purple-400" /> Referral Activity Report
                    </h4>
                    <p className="text-xs text-muted-foreground">Affiliate networks summary showing referrer names, total referred players, deposit completions status, and progress metrics.</p>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      disabled={downloading !== null}
                      onClick={() => triggerReportDownload("referral", "csv")}
                      className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                    >
                      {downloading === "referral_csv" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} CSV
                    </button>
                    <button
                      disabled={downloading !== null}
                      onClick={() => triggerReportDownload("referral", "excel")}
                      className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                    >
                      {downloading === "referral_excel" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />} EXCEL
                    </button>
                    <button
                      disabled={downloading !== null}
                      onClick={() => triggerReportDownload("referral", "pdf")}
                      className="px-2.5 py-1.5 rounded bg-primary hover:opacity-90 text-[10px] font-bold text-primary-foreground transition-all flex items-center gap-1.5 ml-auto"
                    >
                      {downloading === "referral_pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} PRINT PDF
                    </button>
                  </div>
                </div>

                {/* 4. Distribution Payouts Report Card */}
                <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <Coins className="h-4 w-4 text-amber-400" /> Reward Distributions Report
                    </h4>
                    <p className="text-xs text-muted-foreground">Payout transaction list for the selected month/year run. Lists scores, multipliers, status and cash distributed.</p>
                  </div>
                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Month / Year:</span>
                      <select
                        value={repMonth}
                        onChange={(e) => setRepMonth(Number(e.target.value))}
                        className="bg-secondary/40 border border-border/80 rounded text-[10px] px-2 py-0.5 text-foreground cursor-pointer"
                      >
                        {months.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                      </select>
                      <select
                        value={repYear}
                        onChange={(e) => setRepYear(Number(e.target.value))}
                        className="bg-secondary/40 border border-border/80 rounded text-[10px] px-2 py-0.5 text-foreground cursor-pointer"
                      >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={downloading !== null}
                        onClick={() => triggerReportDownload("distribution", "csv")}
                        className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                      >
                        {downloading === "distribution_csv" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} CSV
                      </button>
                      <button
                        disabled={downloading !== null}
                        onClick={() => triggerReportDownload("distribution", "excel")}
                        className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                      >
                        {downloading === "distribution_excel" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />} EXCEL
                      </button>
                      <button
                        disabled={downloading !== null}
                        onClick={() => triggerReportDownload("distribution", "pdf")}
                        className="px-2.5 py-1.5 rounded bg-primary hover:opacity-90 text-[10px] font-bold text-primary-foreground transition-all flex items-center gap-1.5 ml-auto"
                      >
                        {downloading === "distribution_pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} PRINT PDF
                      </button>
                    </div>
                  </div>
                </div>

                {/* 5. Qualification Audit Report Card */}
                <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between md:col-span-2">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-rose-400" /> Player Qualification Report
                    </h4>
                    <p className="text-xs text-muted-foreground">Complete candidate checklist lists for the month, detailing why specific users qualified or got disqualified from reward sharing.</p>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      disabled={downloading !== null}
                      onClick={() => triggerReportDownload("qualification", "csv")}
                      className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                    >
                      {downloading === "qualification_csv" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} CSV
                    </button>
                    <button
                      disabled={downloading !== null}
                      onClick={() => triggerReportDownload("qualification", "excel")}
                      className="px-2.5 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-[10px] font-bold text-foreground transition-all flex items-center gap-1.5"
                    >
                      {downloading === "qualification_excel" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />} EXCEL
                    </button>
                    <button
                      disabled={downloading !== null}
                      onClick={() => triggerReportDownload("qualification", "pdf")}
                      className="px-2.5 py-1.5 rounded bg-primary hover:opacity-90 text-[10px] font-bold text-primary-foreground transition-all flex items-center gap-1.5 ml-auto"
                    >
                      {downloading === "qualification_pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} PRINT PDF
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}
        </>
      )}

    </div>
  );
}
