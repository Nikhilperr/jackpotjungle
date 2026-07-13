import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Settings, ShieldCheck, Percent, Scale, Coins, Calendar, Award, UserPlus, Save, Play, Sparkles, Terminal, ChevronDown, ChevronUp, TrendingUp, Crown, AlertTriangle, FileText, Download, Search, Filter, HelpCircle, RotateCcw, RefreshCw } from "lucide-react";
import { getVipRewardSettings, updateVipRewardSettings } from "@/lib/api/vip-settings.functions";
import { runVipRewardSimulation } from "@/lib/api/vip-reward-engine/engine.functions";
import { getVipRewardRun, saveVipRewardRunDraft, updateVipRewardRunStatus, executeVipRewardRunPayouts } from "@/lib/api/vip-reward-engine/approval.functions";
import { getMonthlyCycleHistory, getVipPlayerHistoryAll } from "@/lib/api/vip-reward-engine/history.functions";
import { getVipAuditLogs } from "@/lib/api/vip-reward-engine/audit.functions";
import { exportRewardHistory, exportAuditLogs, exportPlayerPayouts } from "@/lib/api/vip-reward-engine/export.service";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function HelpTooltip({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1.5 select-none shrink-0 align-middle">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen(!open);
        }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-secondary text-muted-foreground text-[10px] font-bold hover:bg-muted hover:text-foreground active:scale-90 transition-all cursor-help border border-border"
        title="Help Info"
      >
        ?
      </button>
      {open && (
        <span className="absolute z-50 bottom-6 left-1/2 -translate-x-1/2 w-64 p-3 bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs rounded-xl shadow-xl leading-relaxed whitespace-normal break-words pointer-events-none select-none font-normal normal-case block">
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-950 border-r border-b border-neutral-800 rotate-45" />
          {content}
        </span>
      )}
    </span>
  );
}

export function VipRewardSettingsView() {
  const loadFn = useServerFn(getVipRewardSettings);
  const saveFn = useServerFn(updateVipRewardSettings);
  const runSimFn = useServerFn(runVipRewardSimulation);

  const getRunFn = useServerFn(getVipRewardRun);
  const saveDraftFn = useServerFn(saveVipRewardRunDraft);
  const updateStatusFn = useServerFn(updateVipRewardRunStatus);
  const executePayoutsFn = useServerFn(executeVipRewardRunPayouts);

  const getCycleHistoryFn = useServerFn(getMonthlyCycleHistory);
  const getPlayerHistoryFn = useServerFn(getVipPlayerHistoryAll);
  const getAuditLogsFn = useServerFn(getVipAuditLogs);

  const [activeTab, setActiveTab] = useState<"settings" | "simulation" | "history" | "audit">("settings");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Simulation parameters & results
  const [simMonth, setSimMonth] = useState(new Date().getMonth() + 1);
  const [simYear, setSimYear] = useState(new Date().getFullYear());
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [logsExpanded, setLogsExpanded] = useState(false);

  // Active DB Run details
  const [dbRun, setDbRun] = useState<any | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [workflowProcessing, setWorkflowProcessing] = useState(false);
  const [showPayoutConfirm, setShowPayoutConfirm] = useState(false);

  // History state
  const [historyFilterMonth, setHistoryFilterMonth] = useState(0);
  const [historyFilterYear, setHistoryFilterYear] = useState(0);
  const [historyFilterStatus, setHistoryFilterStatus] = useState("all");
  const [historyFilterUsername, setHistoryFilterUsername] = useState("");
  const [historyFilterVip, setHistoryFilterVip] = useState("all");
  const [historyViewMode, setHistoryViewMode] = useState<"cycles" | "players">("cycles");
  const [cyclesHistory, setCyclesHistory] = useState<any[]>([]);
  const [playersHistory, setPlayersHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<any | null>(null);

  // Audit Logs state
  const [auditFilterAction, setAuditFilterAction] = useState("all");
  const [auditFilterUsername, setAuditFilterUsername] = useState("");
  const [auditFilterRole, setAuditFilterRole] = useState("all");
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Pull-to-Refresh & Reset states
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (activeTab === "settings") {
        await loadSettings();
      } else if (activeTab === "simulation") {
        await fetchActiveRun(simMonth, simYear);
      } else if (activeTab === "history") {
        if (historyViewMode === "cycles") {
          await fetchCyclesHistory();
        } else {
          await fetchPlayersHistory();
        }
      } else if (activeTab === "audit") {
        await fetchAuditLogsList();
      }
      toast.success("Active panel refreshed successfully.");
    } catch (err: any) {
      console.error("Refresh failed:", err);
      toast.error("Failed to refresh: " + err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (window.scrollY === 0) {
      setTouchStart(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStart === null) return;
    const currentY = e.touches[0].clientY;
    const distance = currentY - touchStart;
    
    if (distance > 0) {
      // Add a damping factor so the pull resistance increases
      const dampedDistance = Math.min(distance * 0.4, 90);
      setPullDistance(dampedDistance);
    }
  };

  const handleTouchEnd = async () => {
    if (touchStart === null) return;
    setTouchStart(null);

    // If pulled more than 60px, trigger refresh
    if (pullDistance >= 60) {
      setPullDistance(60); // Hold height while refreshing
      await handleRefresh();
    }
    setPullDistance(0);
  };

  const fetchActiveRun = async (m: number, y: number) => {
    setLoadingRun(true);
    setDbRun(null);
    setSimResult(null);
    setSimError(null);
    try {
      const res = (await getRunFn({ data: { month: m, year: y } })) as any;
      if (res.success && res.run) {
        const runData = res.run as any;
        setDbRun(runData);
        setSimResult({
          pool_size: Number(runData.reward_pool),
          total_qualified_users: runData.total_qualified_users,
          total_distributed_rewards: Number(runData.total_distributed_rewards),
          execution_time_ms: 0,
          configuration: runData.configuration,
          user_results: runData.player_results,
          logs: runData.logs,
        });
      }
    } catch (err: any) {
      console.error("Failed to load active run state:", err.message);
    } finally {
      setLoadingRun(false);
    }
  };

  const fetchCyclesHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = (await getCycleHistoryFn({
        data: {
          month: historyFilterMonth,
          year: historyFilterYear,
          status: historyFilterStatus,
        }
      })) as any;
      if (res.success && res.cycles) {
        setCyclesHistory(res.cycles);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load cycles history");
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchPlayersHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = (await getPlayerHistoryFn({
        data: {
          month: historyFilterMonth,
          year: historyFilterYear,
          username: historyFilterUsername,
          vipLevel: historyFilterVip,
        }
      })) as any;
      if (res.success && res.history) {
        setPlayersHistory(res.history);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load players payout history");
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchAuditLogsList = async () => {
    setLoadingAudit(true);
    try {
      const res = (await getAuditLogsFn({
        data: {
          action: auditFilterAction,
          username: auditFilterUsername,
          role: auditFilterRole,
        }
      })) as any;
      if (res.success && res.logs) {
        setAuditLogs(res.logs);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load audit logs");
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === "simulation") {
      fetchActiveRun(simMonth, simYear);
    } else if (activeTab === "history") {
      if (historyViewMode === "cycles") {
        fetchCyclesHistory();
      } else {
        fetchPlayersHistory();
      }
    } else if (activeTab === "audit") {
      fetchAuditLogsList();
    }
  }, [
    activeTab,
    simMonth,
    simYear,
    historyViewMode,
    historyFilterMonth,
    historyFilterYear,
    historyFilterStatus,
    historyFilterVip,
    auditFilterAction,
    auditFilterRole
  ]);

  // Dynamic Years Range Generator (handles automatic rollover for any future year)
  const startYear = 2024;
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: Math.max(currentYear - startYear + 6, 8) }, (_, i) => startYear + i);

  // Form Fields State
  const [rewardPoolPercentage, setRewardPoolPercentage] = useState("5.0");
  const [depositWeight, setDepositWeight] = useState("35.0");
  const [holdingWeight, setHoldingWeight] = useState("30.0");
  const [referralWeight, setReferralWeight] = useState("15.0");
  const [loyaltyWeight, setLoyaltyWeight] = useState("20.0");
  const [rewardCapPercentage, setRewardCapPercentage] = useState("10.0");
  const [minMonthlyDeposit, setMinMonthlyDeposit] = useState("100.0");
  const [minHoldingRequirement, setMinHoldingRequirement] = useState("50.0");
  const [distributionDate, setDistributionDate] = useState("1");
  const [runTime, setRunTime] = useState("00:00");
  const [timezone, setTimezone] = useState("America/New_York");

  // Multipliers State
  const [bronze, setBronze] = useState("1.00");
  const [silver, setSilver] = useState("1.05");
  const [gold, setGold] = useState("1.10");
  const [platinum, setPlatinum] = useState("1.20");
  const [diamond, setDiamond] = useState("1.30");
  const [blackDiamond, setBlackDiamond] = useState("1.50");

  // Referral Rules State
  const [minReferredDeposit, setMinReferredDeposit] = useState("50.0");
  const [requiresVerification, setRequiresVerification] = useState(false);

  // Load active configurations from db
  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = (await loadFn()) as any;
      if (res.success && res.settings) {
        const s = res.settings as any;
        setRewardPoolPercentage(String(s.reward_pool_percentage));
        setDepositWeight(String(s.deposit_weight));
        setHoldingWeight(String(s.holding_weight));
        setReferralWeight(String(s.referral_weight));
        setLoyaltyWeight(String(s.loyalty_weight));
        setRewardCapPercentage(String(s.reward_cap_percentage));
        setMinMonthlyDeposit(String(s.min_monthly_deposit));
        setMinHoldingRequirement(String(s.min_holding_requirement));
        setDistributionDate(String(s.distribution_date));
        setRunTime(String(s.run_time ?? "00:00"));
        setTimezone(String(s.timezone ?? "America/New_York"));
        
        // Multipliers
        if (s.vip_multipliers) {
          setBronze(String(s.vip_multipliers.bronze ?? 1.0));
          setSilver(String(s.vip_multipliers.silver ?? 1.05));
          setGold(String(s.vip_multipliers.gold ?? 1.10));
          setPlatinum(String(s.vip_multipliers.platinum ?? 1.20));
          setDiamond(String(s.vip_multipliers.diamond ?? 1.30));
          setBlackDiamond(String(s.vip_multipliers.black_diamond ?? 1.50));
        }

        // Referral rules
        if (s.referral_qualification_rules) {
          setMinReferredDeposit(String(s.referral_qualification_rules.min_referred_deposit ?? 50.0));
          setRequiresVerification(Boolean(s.referral_qualification_rules.requires_verification ?? false));
        }
      } else if (res.error) {
        toast.error(`Failed to load settings: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred loading configurations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Compute live score weights sum
  const weightsSum = Number(depositWeight || 0) + Number(holdingWeight || 0) + Number(referralWeight || 0) + Number(loyaltyWeight || 0);
  const isWeightsValid = Math.abs(weightsSum - 100) < 0.001;

  // Handle Form Submission
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const numPoolPct = Number(rewardPoolPercentage || 0);
    const numCapPct = Number(rewardCapPercentage || 0);
    const numDistDate = Number(distributionDate || 1);

    // 1. Validation checks
    if (!isWeightsValid) {
      toast.error(`Score weights must sum to exactly 100 points. (Current Sum: ${weightsSum})`);
      return;
    }
    if (numPoolPct < 0 || numPoolPct > 100) {
      toast.error("Reward Pool Percentage must be between 0% and 100%.");
      return;
    }
    if (numCapPct < 0 || numCapPct > 100) {
      toast.error("Reward Cap Percentage must be between 0% and 100%.");
      return;
    }
    if (numDistDate < 1 || numDistDate > 28) {
      toast.error("Distribution Day of Month must be between 1 and 28.");
      return;
    }

    setSaving(true);
    try {
      const res = (await saveFn({
        data: {
          rewardPoolPercentage: numPoolPct,
          depositWeight: Number(depositWeight || 0),
          holdingWeight: Number(holdingWeight || 0),
          referralWeight: Number(referralWeight || 0),
          loyaltyWeight: Number(loyaltyWeight || 0),
          rewardCapPercentage: numCapPct,
          minMonthlyDeposit: Number(minMonthlyDeposit || 0),
          minHoldingRequirement: Number(minHoldingRequirement || 0),
          distributionDate: numDistDate,
          runTime: runTime || "00:00",
          timezone: timezone || "UTC",
          vipMultipliers: {
            bronze: Number(bronze || 0),
            silver: Number(silver || 0),
            gold: Number(gold || 0),
            platinum: Number(platinum || 0),
            diamond: Number(diamond || 0),
            black_diamond: Number(blackDiamond || 0),
          },
          referralQualificationRules: {
            min_referred_deposit: Number(minReferredDeposit || 0),
            requires_verification: requiresVerification,
          },
        }
      })) as any;

      if (res.success) {
        toast.success("VIP Loyalty Settings saved successfully!");
      } else {
        toast.error(res.error || "Failed to update configurations.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update configuration settings.");
    } finally {
      setSaving(false);
    }
  };
  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimRunning(true);
    setSimResult(null);
    setSimError(null);
    try {
      const res = (await runSimFn({
        data: {
          month: Number(simMonth),
          year: Number(simYear),
          isSimulation: true,
        }
      })) as any;
      if (res.success && res.result) {
        if (res.result.status === "error") {
          setSimError(res.result.error_message || "An unexpected error occurred during execution.");
        } else {
          setSimResult(res.result);
          // Save calculation results to database
          const saveRes = (await saveDraftFn({
            data: {
              month: Number(simMonth),
              year: Number(simYear),
              status: "Calculated",
              rewardPool: res.result.pool_size,
              totalQualifiedUsers: res.result.total_qualified_users,
              totalDistributedRewards: res.result.total_distributed_rewards,
              configuration: res.result.configuration,
              playerResults: res.result.user_results,
              logs: res.result.logs,
            }
          })) as any;
          if (saveRes.success) {
            setDbRun(saveRes.run);
            toast.success("Calculation draft saved successfully!");
          } else {
            setSimError(saveRes.error || "Failed to persist calculations draft.");
          }
        }
      } else {
        setSimError(res.error || "Failed to execute calculation engine.");
      }
    } catch (err: any) {
      setSimError(err.message || "Failed to run simulation.");
    } finally {
      setSimRunning(false);
    }
  };
  const handleWorkflowTransition = async (targetStatus: "Pending Review" | "Approved" | "Rejected" | "Locked") => {
    if (!dbRun?.id) return;
    setWorkflowProcessing(true);
    try {
      const res = (await updateStatusFn({
        data: {
          runId: dbRun.id,
          status: targetStatus,
        }
      })) as any;
      if (res.success && res.run) {
        setDbRun(res.run);
        toast.success(`Workflow updated to: ${targetStatus}`);
      } else {
        toast.error(res.error || "Failed to update workflow status.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to change run status.");
    } finally {
      setWorkflowProcessing(false);
    }
  };

  const handleExecutePayouts = async () => {
    if (!dbRun?.id) return;
    setShowPayoutConfirm(false);
    setWorkflowProcessing(true);
    try {
      const res = (await executePayoutsFn({
        data: {
          runId: dbRun.id,
        }
      })) as any;
      if (res.success) {
        toast.success("VIP Rewards payout completed and user wallets credited successfully!");
        await fetchActiveRun(simMonth, simYear);
      } else {
        toast.error(res.error || "Failed to execute reward payouts.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed executing payouts.");
    } finally {
      setWorkflowProcessing(false);
    }
  };

  const handleRecalculate = () => {
    setSimResult(null);
    setDbRun(null);
    toast.success("Ready for recalculation. You can modify settings and run again.");
  };

  if (loading) {
    return (
      <div className="h-64 w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6 overflow-hidden"
    >
      {/* Pull-to-Refresh Spinner Indicator */}
      <div 
        className="transition-all duration-200 ease-out overflow-hidden flex items-center justify-center bg-secondary/10 border border-border/20 rounded-2xl"
        style={{ 
          height: pullDistance > 0 ? `${pullDistance}px` : '0px',
          opacity: pullDistance > 0 ? pullDistance / 60 : 0,
        }}
      >
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground py-2">
          <RefreshCw className={`h-4 w-4 text-primary ${pullDistance >= 60 || refreshing ? "animate-spin" : ""}`} />
          <span>{pullDistance >= 60 ? "Release to refresh..." : "Pull down to refresh active tab..."}</span>
        </div>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="space-y-1 text-left">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" /> VIP & Loyalty Settings
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Configure monthly calculation pool variables, score weights, multipliers, and qualifications.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold border-border bg-secondary/20 hover:bg-secondary/50 transition-all"
            title="Refresh current panel data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold border border-amber-500/20 shadow-sm">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>SUPER ADMIN ONLY</span>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-border/60 select-none pb-0.5 mb-2 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`px-5 py-2 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === "settings"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Configuration Settings
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("simulation")}
          className={`px-5 py-2 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "simulation"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span>Payout Simulation Preview</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`px-5 py-2 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Award className="h-4 w-4 text-primary shrink-0" />
          <span>Reward History</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`px-5 py-2 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "audit"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Terminal className="h-4 w-4 text-primary shrink-0" />
          <span>Audit Logs</span>
        </button>
      </div>

      {activeTab === "settings" ? (
        <form onSubmit={handleSave} className="space-y-6">
        
        {/* Module 2 & 3: Pool Configurations */}
        <section className="bg-card border border-border/60 rounded-2xl p-5 space-y-4 shadow-sm text-left">
          <div className="flex items-center gap-2 border-b border-border/30 pb-3">
            <Percent className="h-5 w-5 text-primary shrink-0" />
            <h3 className="font-extrabold text-base">Reward Pool Parameters</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="rewardPoolPct" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Reward Pool Percentage (%)</span>
                <HelpTooltip content="The percentage of total users' holdings allocated each month to fund the VIP reward payouts. E.g., if set to 5%, the system uses 5% of the platform's monthly assets to distribute rewards." />
              </label>
              <Input
                id="rewardPoolPct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={rewardPoolPercentage}
                onChange={(e) => setRewardPoolPercentage(e.target.value)}
                placeholder="e.g. 5.0"
                required
              />
              <span className="text-[10px] text-muted-foreground font-semibold leading-relaxed block">
                Configures the monthly reward pool as a % of absolute monthly holding.
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rewardCapPct" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Reward Cap Percentage (%)</span>
                <HelpTooltip content="The maximum percentage of the total reward pool that a single user can receive. E.g., if set to 10%, no single player can walk away with more than 10% of the entire monthly pool, protecting against heavy whale manipulation." />
              </label>
              <Input
                id="rewardCapPct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={rewardCapPercentage}
                onChange={(e) => setRewardCapPercentage(e.target.value)}
                placeholder="e.g. 10.0"
                required
              />
              <span className="text-[10px] text-muted-foreground font-semibold leading-relaxed block">
                Caps maximum individual payouts to a configured percentage of the total pool.
              </span>
            </div>
          </div>
        </section>

        {/* Module 5: Score Weights */}
        <section className="bg-card border border-border/60 rounded-2xl p-5 space-y-4 shadow-sm text-left">
          <div className="flex items-center justify-between border-b border-border/30 pb-3">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary shrink-0" />
              <h3 className="font-extrabold text-base">Base Score Contribution Weights</h3>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
              isWeightsValid 
                ? "bg-green-500/10 text-green-400 border-green-500/20" 
                : "bg-destructive/10 text-destructive border-destructive/20 animate-pulse"
            }`}>
              Sum: {weightsSum} / 100
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="depWeight" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Deposit Weight</span>
                <HelpTooltip content="Determines the contribution weight (out of 100 total points) of a user's total monthly deposits when calculating their final score." />
              </label>
              <Input
                id="depWeight"
                type="number"
                min="0"
                max="100"
                value={depositWeight}
                onChange={(e) => setDepositWeight(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="holdWeight" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Holding Weight</span>
                <HelpTooltip content="Determines the contribution weight (out of 100 total points) of a user's average asset balance holdings when calculating their final score." />
              </label>
              <Input
                id="holdWeight"
                type="number"
                min="0"
                max="100"
                value={holdingWeight}
                onChange={(e) => setHoldingWeight(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="refWeight" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Referral Weight</span>
                <HelpTooltip content="Determines the contribution weight (out of 100 total points) of a user's referral deposit performance when calculating their final score." />
              </label>
              <Input
                id="refWeight"
                type="number"
                min="0"
                max="100"
                value={referralWeight}
                onChange={(e) => setReferralWeight(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="loyWeight" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Loyalty Weight</span>
                <HelpTooltip content="Determines the contribution weight (out of 100 total points) of a user's overall longevity and engagement score." />
              </label>
              <Input
                id="loyWeight"
                type="number"
                min="0"
                max="100"
                value={loyaltyWeight}
                onChange={(e) => setLoyaltyWeight(e.target.value)}
                required
              />
            </div>
          </div>
          {!isWeightsValid && (
            <p className="text-xs font-semibold text-destructive animate-pulse">
              ⚠️ Warning: Deposit + Holding + Referral + Loyalty weights must sum to exactly 100 points.
            </p>
          )}
        </section>

        {/* Module 4: Player Qualifications & Workflow */}
        <section className="bg-card border border-border/60 rounded-2xl p-5 space-y-4 shadow-sm text-left">
          <div className="flex items-center gap-2 border-b border-border/30 pb-3">
            <Coins className="h-5 w-5 text-primary shrink-0" />
            <h3 className="font-extrabold text-base">Qualification Thresholds</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="minDeposit" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Min Monthly Deposit ($)</span>
                <HelpTooltip content="The minimum deposit amount required in a single month for a user to qualify for any monthly loyalty reward payout." />
              </label>
              <Input
                id="minDeposit"
                type="number"
                min="0"
                value={minMonthlyDeposit}
                onChange={(e) => setMinMonthlyDeposit(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="minHolding" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Min Monthly Holding ($)</span>
                <HelpTooltip content="The minimum average holding balance required for a user to qualify for monthly loyalty rewards." />
              </label>
              <Input
                id="minHolding"
                type="number"
                min="0"
                value={minHoldingRequirement}
                onChange={(e) => setMinHoldingRequirement(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="distDate" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> <span>Distribution Date (Day)</span>
                <HelpTooltip content="The day of the month (between 1 and 28) when the reward engine automatically processes payouts and updates balances." />
              </label>
              <Input
                id="distDate"
                type="number"
                min="1"
                max="28"
                value={distributionDate}
                onChange={(e) => setDistributionDate(e.target.value)}
                required
              />
              <span className="text-[9px] text-muted-foreground leading-none font-medium">Day of month (1-28)</span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="runTime" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <span>Monthly Run Time</span>
                <HelpTooltip content="The time of day (HH:MM in 24-hour format) when the automation trigger will process calculations." />
              </label>
              <Input
                id="runTime"
                type="text"
                placeholder="e.g. 02:00"
                value={runTime}
                onChange={(e) => setRunTime(e.target.value)}
                required
              />
              <span className="text-[9px] text-muted-foreground leading-none font-medium">24-hour format (e.g., 14:30)</span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="timezone" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <span>Time Zone</span>
                <HelpTooltip content="The target time zone for evaluating the schedule." />
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">EST / EDT (New York)</option>
                <option value="America/Los_Angeles">PST / PDT (Los Angeles)</option>
                <option value="Europe/London">GMT / BST (London)</option>
                <option value="Asia/Kolkata">IST (India)</option>
                <option value="Asia/Singapore">SGT (Singapore)</option>
                <option value="Australia/Sydney">AEST / AEDT (Sydney)</option>
              </select>
              <span className="text-[9px] text-muted-foreground leading-none font-medium">Time zone for execution</span>
            </div>
          </div>
        </section>

        {/* Module 6: VIP Engine Multipliers */}
        <section className="bg-card border border-border/60 rounded-2xl p-5 space-y-4 shadow-sm text-left">
          <div className="flex items-center gap-2 border-b border-border/30 pb-3">
            <Award className="h-5 w-5 text-primary shrink-0" />
            <h3 className="font-extrabold text-base">VIP Level Multipliers</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="vipBronze" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Bronze</span>
                <HelpTooltip content="Reward multiplier for the Bronze VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipBronze" type="number" step="0.01" min="0" value={bronze} onChange={(e) => setBronze(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipSilver" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Silver</span>
                <HelpTooltip content="Reward multiplier for the Silver VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipSilver" type="number" step="0.01" min="0" value={silver} onChange={(e) => setSilver(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipGold" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Gold</span>
                <HelpTooltip content="Reward multiplier for the Gold VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipGold" type="number" step="0.01" min="0" value={gold} onChange={(e) => setGold(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipPlatinum" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Platinum</span>
                <HelpTooltip content="Reward multiplier for the Platinum VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipPlatinum" type="number" step="0.01" min="0" value={platinum} onChange={(e) => setPlatinum(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipDiamond" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Diamond</span>
                <HelpTooltip content="Reward multiplier for the Diamond VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipDiamond" type="number" step="0.01" min="0" value={diamond} onChange={(e) => setDiamond(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipBlackDiamond" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Black Diamond</span>
                <HelpTooltip content="Reward multiplier for the Black Diamond VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipBlackDiamond" type="number" step="0.01" min="0" value={blackDiamond} onChange={(e) => setBlackDiamond(e.target.value)} required />
            </div>
          </div>
        </section>

        {/* Referral Rules */}
        <section className="bg-card border border-border/60 rounded-2xl p-5 space-y-4 shadow-sm text-left">
          <div className="flex items-center gap-2 border-b border-border/30 pb-3">
            <UserPlus className="h-5 w-5 text-primary shrink-0" />
            <h3 className="font-extrabold text-base">Referral Qualification Rules</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="minRefDeposit" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Min Referred User Deposit ($)</span>
                <HelpTooltip content="The minimum deposit a referred friend must complete in order to count towards the referrer's VIP score points." />
              </label>
              <Input
                id="minRefDeposit"
                type="number"
                min="0"
                value={minReferredDeposit}
                onChange={(e) => setMinReferredDeposit(e.target.value)}
                required
              />
              <span className="text-[10px] text-muted-foreground font-semibold leading-relaxed block">
                Minimum deposit required for referred user to qualify for reward calculations.
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Referred User Verification Required</span>
                <HelpTooltip content="If active, referred friends must complete their profile and identity verification before their deposits count toward the referrer's VIP points." />
              </label>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRequiresVerification(!requiresVerification)}
                  className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer relative ${
                    requiresVerification ? "bg-primary" : "bg-zinc-700"
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${
                    requiresVerification ? "translate-x-6" : "translate-x-0"
                  }`} />
                </button>
                <span className="text-xs font-semibold text-foreground">
                  {requiresVerification ? "Verification Required" : "No Verification Required"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowResetConfirm(true)}
            className="w-full sm:w-auto h-12 px-8 rounded-xl font-bold flex items-center justify-center gap-2 text-sm border-border bg-secondary/10 hover:bg-secondary/40 transition-all"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset Settings</span>
          </Button>
          <Button
            type="submit"
            disabled={saving || !isWeightsValid}
            className="w-full sm:w-auto h-12 px-8 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all text-sm"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Configuration</span>
              </>
            )}
          </Button>
        </div>

      </form>
      ) : (
        <div className="space-y-6">
          {/* Controls Card */}
          <section className="bg-card border border-border/60 rounded-2xl p-5 space-y-4 shadow-sm text-left">
            <div className="flex items-center gap-2 border-b border-border/30 pb-3">
              <Play className="h-5 w-5 text-primary shrink-0" />
              <h3 className="font-extrabold text-base">Run Reward Simulation</h3>
            </div>
            
            <form onSubmit={handleRunSimulation} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Month</label>
                <select
                  value={simMonth}
                  onChange={(e) => setSimMonth(Number(e.target.value))}
                  className="w-full h-10 px-3 bg-secondary rounded-lg border border-border text-xs font-semibold focus:outline-none"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(0, m - 1).toLocaleString("en", { month: "long" })}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Year</label>
                <select
                  value={simYear}
                  onChange={(e) => setSimYear(Number(e.target.value))}
                  className="w-full h-10 px-3 bg-secondary rounded-lg border border-border text-xs font-semibold focus:outline-none"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="submit"
                disabled={simRunning || (dbRun && dbRun.status !== 'Calculated' && dbRun.status !== 'Rejected')}
                className="h-10 w-full font-bold flex items-center justify-center gap-1.5 text-xs uppercase"
              >
                {simRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>Executing Calculation...</span>
                  </>
                ) : dbRun && dbRun.status !== 'Calculated' && dbRun.status !== 'Rejected' ? (
                  <>
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Calculations Locked</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span>Run Calculation</span>
                  </>
                )}
              </Button>
            </form>
          </section>

          {/* Active Run Workflow Control Panel */}
          {loadingRun ? (
            <div className="h-32 w-full flex items-center justify-center bg-card border border-border/60 rounded-2xl p-5">
              <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
              <span className="text-xs font-semibold text-muted-foreground">Loading active month workflow status...</span>
            </div>
          ) : dbRun ? (
            <section className="bg-card border border-border/60 rounded-2xl p-5 text-left space-y-4 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/30 pb-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Active Run Payout State</span>
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-primary shrink-0" />
                    <h3 className="font-extrabold text-base">Super Admin Review & Approvals</h3>
                  </div>
                </div>
                
                {/* Status Badges */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">Status:</span>
                  <span className={`text-xs font-black uppercase px-3 py-1 rounded-full border shadow-sm select-none ${
                    dbRun.status === 'Draft' || dbRun.status === 'Calculated' ? 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400' :
                    dbRun.status === 'Pending Review' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                    dbRun.status === 'Approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                    dbRun.status === 'Rejected' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                    dbRun.status === 'Completed' ? 'bg-primary/10 border-primary/20 text-primary' :
                    dbRun.status === 'Locked' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : ''
                  }`}>
                    {dbRun.status}
                  </span>
                </div>
              </div>

              {/* Status helper text & workflows */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-secondary/15 p-4 rounded-xl border border-border/40">
                <div className="flex-1 space-y-0.5 text-xs">
                  {dbRun.status === 'Calculated' && (
                    <p className="font-semibold text-foreground">
                      Payout calculation draft is ready. Review calculations and submit to begin approval loop.
                    </p>
                  )}
                  {dbRun.status === 'Pending Review' && (
                    <p className="font-bold text-amber-500">
                      Calculation draft is under review. Super Admins must verify stats and approve or reject payouts.
                    </p>
                  )}
                  {dbRun.status === 'Approved' && (
                    <p className="font-bold text-emerald-500">
                      Month run has been APPROVED by a Super Admin. Payout execution is ready to credit user wallets.
                    </p>
                  )}
                  {dbRun.status === 'Rejected' && (
                    <p className="font-semibold text-rose-500">
                      Payout calculation was REJECTED. Recalculate month with modified weights or settings to overwrite.
                    </p>
                  )}
                  {dbRun.status === 'Completed' && (
                    <p className="font-bold text-primary">
                      Payout distribution COMPLETED. Wallet balances have been credited. Lock the month to secure records.
                    </p>
                  )}
                  {dbRun.status === 'Locked' && (
                    <p className="font-semibold text-muted-foreground">
                      Month is LOCKED. Result records are final and read-only. Duplicate checks are permanently locked.
                    </p>
                  )}
                </div>

                {/* Action Workflow Controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {workflowProcessing ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold px-4 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Processing...</span>
                    </div>
                  ) : (
                    <>
                      {(dbRun.status === 'Calculated' || dbRun.status === 'Rejected') && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleWorkflowTransition('Pending Review')}
                            className="bg-amber-500 hover:bg-amber-600 text-neutral-950 font-bold h-9 px-4 rounded-lg text-xs"
                          >
                            Submit for Review
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleRecalculate}
                            className="h-9 px-4 rounded-lg text-xs font-semibold"
                          >
                            Recalculate Month
                          </Button>
                        </>
                      )}

                      {dbRun.status === 'Pending Review' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleWorkflowTransition('Approved')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 px-4 rounded-lg text-xs"
                          >
                            Approve Run
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleWorkflowTransition('Rejected')}
                            variant="destructive"
                            className="font-bold h-9 px-4 rounded-lg text-xs"
                          >
                            Reject Run
                          </Button>
                        </>
                      )}

                      {dbRun.status === 'Approved' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setShowPayoutConfirm(true)}
                            className="bg-primary hover:bg-primary/95 text-primary-foreground font-black h-9 px-4 rounded-lg text-xs uppercase animate-pulse"
                          >
                            Approve & Execute Payouts
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleWorkflowTransition('Rejected')}
                            variant="destructive"
                            className="font-bold h-9 px-4 rounded-lg text-xs"
                          >
                            Reject Run
                          </Button>
                        </>
                      )}

                      {dbRun.status === 'Completed' && (
                        <Button
                          size="sm"
                          onClick={() => handleWorkflowTransition('Locked')}
                          className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold h-9 px-4 rounded-lg text-xs"
                        >
                          Lock Month
                        </Button>
                      )}

                      {dbRun.status === 'Locked' && (
                        <span className="text-xs text-muted-foreground font-black uppercase tracking-wider px-3 py-1 rounded bg-zinc-800 border border-zinc-700 select-none">
                          🔒 READ-ONLY
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {/* Error Message Panel */}
          {simError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl p-5 text-left space-y-2">
              <h4 className="font-extrabold text-sm flex items-center gap-2">
                Calculation Failed
              </h4>
              <p className="text-xs font-semibold font-mono whitespace-pre-line leading-relaxed">{simError}</p>
            </div>
          )}

          {/* Simulation Statistics & Results table */}
          {simResult && (
            <div className="space-y-6">
              {/* Stat Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border/60 rounded-xl p-4 text-left space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Reward Pool Size</span>
                  <p className="text-lg font-black font-mono text-foreground">${simResult.pool_size.toFixed(2)}</p>
                </div>
                <div className="bg-card border border-border/60 rounded-xl p-4 text-left space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Qualified Players</span>
                  <p className="text-lg font-black font-mono text-primary">{simResult.total_qualified_users}</p>
                </div>
                <div className="bg-card border border-border/60 rounded-xl p-4 text-left space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Distributed Payout</span>
                  <p className="text-lg font-black font-mono text-foreground">${simResult.total_distributed_rewards.toFixed(2)}</p>
                </div>
                <div className="bg-card border border-border/60 rounded-xl p-4 text-left space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Execution Duration</span>
                  <p className="text-lg font-black font-mono text-muted-foreground">{simResult.execution_time_ms}ms</p>
                </div>
              </div>

              {/* Qualified Players Results list */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm text-left">
                <div className="p-4 border-b border-border/60 bg-secondary/20 flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-foreground">Calculated Distributions (Read-Only Preview)</h4>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    dbRun ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                  }`}>
                    {dbRun ? `Persisted: ${dbRun.status}` : "Draft: Simulation Mode"}
                  </span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="border-b border-border/80 bg-secondary/35 text-[10px] uppercase tracking-wider text-muted-foreground font-bold select-none">
                        <th className="p-3 pl-5">Player Profile</th>
                        <th className="p-3 text-right">Base Score</th>
                        <th className="p-3 text-right">Multiplier</th>
                        <th className="p-3 text-right">Adjusted Score</th>
                        <th className="p-3 text-right">Reward (Pre-Cap)</th>
                        <th className="p-3 text-center">Cap Applied</th>
                        <th className="p-3 pr-5 text-right text-primary font-extrabold">Final Reward</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {simResult.user_results.filter((u: any) => u.qualified).map((u: any) => (
                        <tr key={u.user_id} className="hover:bg-secondary/15 transition-colors">
                          <td className="p-3 pl-5">
                            <span className="font-bold text-sm text-foreground">@{u.username}</span>
                            <span className="ml-1.5 text-[10px] font-bold uppercase text-muted-foreground">({u.vip_status || "None"})</span>
                          </td>
                          <td className="p-3 text-right font-mono text-xs font-semibold text-muted-foreground">
                            {u.base_score.toFixed(2)}%
                          </td>
                          <td className="p-3 text-right font-mono text-xs font-semibold text-muted-foreground">
                            {u.multiplier.toFixed(2)}x
                          </td>
                          <td className="p-3 text-right font-mono text-xs font-semibold text-muted-foreground">
                            {u.final_score.toFixed(4)}%
                          </td>
                          <td className="p-3 text-right font-mono text-xs font-semibold text-muted-foreground">
                            ${(u.reward_before_protection ?? 0).toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
                            {u.cap_applied ? (
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 select-none">
                                CAPPED
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-bold">—</span>
                            )}
                          </td>
                          <td className="p-3 pr-5 text-right font-mono text-sm font-black text-primary">
                            ${(u.final_reward ?? u.estimated_payout).toFixed(2)}
                          </td>
                        </tr>
                      ))}

                      {simResult.user_results.filter((u: any) => u.qualified).length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground font-semibold">
                            No users qualified for payouts under the current thresholds configuration.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Logs explorer section */}
              <section className="bg-neutral-950 border border-neutral-900 rounded-2xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setLogsExpanded(!logsExpanded)}
                  className="w-full p-4 flex items-center justify-between font-bold text-neutral-200 hover:bg-neutral-900/50 transition-colors text-xs uppercase select-none border-b border-neutral-900"
                >
                  <span className="flex items-center gap-1.5">
                    <Terminal className="h-4 w-4 text-primary" />
                    <span>Calculation Logs Console</span>
                  </span>
                  {logsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {logsExpanded && (
                  <div className="p-4 bg-neutral-950 text-neutral-400 font-mono text-[10px] text-left leading-relaxed space-y-1.5 h-64 overflow-y-auto">
                    {simResult.logs.map((log: string, idx: number) => (
                      <div key={idx} className="whitespace-pre-wrap select-text">
                        <span className="text-neutral-600 select-none mr-2">[{idx + 1}]</span>
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="text-left space-y-1">
              <h3 className="text-lg font-black text-foreground">Reward Distribution Cycles</h3>
              <p className="text-xs text-muted-foreground">Review permanent history records of completed monthly runs and user payouts.</p>
            </div>
            
            {/* View Mode switcher */}
            <div className="flex bg-secondary/35 p-1 rounded-xl select-none shrink-0">
              <button
                type="button"
                onClick={() => setHistoryViewMode("cycles")}
                className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${
                  historyViewMode === "cycles" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monthly Cycles
              </button>
              <button
                type="button"
                onClick={() => setHistoryViewMode("players")}
                className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${
                  historyViewMode === "players" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Player Payouts
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            {historyViewMode === "cycles" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Month</label>
                  <select
                    value={historyFilterMonth}
                    onChange={(e) => setHistoryFilterMonth(Number(e.target.value))}
                    className="w-full h-10 bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground font-semibold outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value={0}>All Months</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(0, i).toLocaleString("en", { month: "long" })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Year</label>
                  <select
                    value={historyFilterYear}
                    onChange={(e) => setHistoryFilterYear(Number(e.target.value))}
                    className="w-full h-10 bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground font-semibold outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value={0}>All Years</option>
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</label>
                  <select
                    value={historyFilterStatus}
                    onChange={(e) => setHistoryFilterStatus(e.target.value)}
                    className="w-full h-10 bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground font-semibold outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Completed">Completed</option>
                    <option value="Locked">Locked</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 select-none">Export History</label>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => exportRewardHistory(cyclesHistory, "csv")}
                      disabled={cyclesHistory.length === 0}
                      variant="outline"
                      className="flex-1 h-10 text-[10px] font-bold uppercase rounded-xl border-border bg-secondary/50 hover:bg-secondary"
                    >
                      <Download className="h-3 w-3 mr-1" /> CSV
                    </Button>
                    <Button
                      onClick={() => exportRewardHistory(cyclesHistory, "excel")}
                      disabled={cyclesHistory.length === 0}
                      variant="outline"
                      className="flex-1 h-10 text-[10px] font-bold uppercase rounded-xl border-border bg-secondary/50 hover:bg-secondary"
                    >
                      <FileText className="h-3 w-3 mr-1" /> XLS
                    </Button>
                    <Button
                      onClick={() => exportRewardHistory(cyclesHistory, "pdf")}
                      disabled={cyclesHistory.length === 0}
                      variant="outline"
                      className="flex-1 h-10 text-[10px] font-bold uppercase rounded-xl border-border bg-secondary/50 hover:bg-secondary"
                    >
                      <FileText className="h-3 w-3 mr-1" /> PDF
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Username</label>
                  <div className="relative">
                    <Input
                      value={historyFilterUsername}
                      onChange={(e) => setHistoryFilterUsername(e.target.value)}
                      placeholder="Search player..."
                      className="bg-secondary text-xs pl-8 h-10 border-border"
                    />
                    <Search className="absolute left-2.5 top-3.5 h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Month</label>
                  <select
                    value={historyFilterMonth}
                    onChange={(e) => setHistoryFilterMonth(Number(e.target.value))}
                    className="w-full h-10 bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground font-semibold outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value={0}>All Months</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(0, i).toLocaleString("en", { month: "long" })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Year</label>
                  <select
                    value={historyFilterYear}
                    onChange={(e) => setHistoryFilterYear(Number(e.target.value))}
                    className="w-full h-10 bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground font-semibold outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value={0}>All Years</option>
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">VIP Level</label>
                  <select
                    value={historyFilterVip}
                    onChange={(e) => setHistoryFilterVip(e.target.value)}
                    className="w-full h-10 bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground font-semibold outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="all">All Levels</option>
                    <option value="bronze">Bronze</option>
                    <option value="silver">Silver</option>
                    <option value="gold">Gold</option>
                    <option value="platinum">Platinum</option>
                    <option value="diamond">Diamond</option>
                    <option value="black_diamond">Black Diamond</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 select-none">Export Payouts</label>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => exportPlayerPayouts(playersHistory, "csv")}
                      disabled={playersHistory.length === 0}
                      variant="outline"
                      className="flex-1 h-10 text-[10px] font-bold uppercase rounded-xl border-border bg-secondary/50 hover:bg-secondary"
                    >
                      <Download className="h-3 w-3 mr-1" /> CSV
                    </Button>
                    <Button
                      onClick={() => exportPlayerPayouts(playersHistory, "excel")}
                      disabled={playersHistory.length === 0}
                      variant="outline"
                      className="flex-1 h-10 text-[10px] font-bold uppercase rounded-xl border-border bg-secondary/50 hover:bg-secondary"
                    >
                      <FileText className="h-3 w-3 mr-1" /> XLS
                    </Button>
                    <Button
                      onClick={() => exportPlayerPayouts(playersHistory, "pdf")}
                      disabled={playersHistory.length === 0}
                      variant="outline"
                      className="flex-1 h-10 text-[10px] font-bold uppercase rounded-xl border-border bg-secondary/50 hover:bg-secondary"
                    >
                      <FileText className="h-3 w-3 mr-1" /> PDF
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results Block */}
          {loadingHistory ? (
            <div className="bg-card border border-border/80 rounded-2xl p-16 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground font-medium select-none">Loading rewards history data...</p>
            </div>
          ) : historyViewMode === "cycles" ? (
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm text-left">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="border-b border-border/80 bg-secondary/35 text-[10px] uppercase tracking-wider text-muted-foreground font-bold select-none">
                      <th className="p-3.5 pl-5">Cycle period</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-right">allocated Pool</th>
                      <th className="p-3.5 text-right">Deposits / Holding</th>
                      <th className="p-3.5 text-center">qualified users</th>
                      <th className="p-3.5 text-right">Distributed Amount</th>
                      <th className="p-3.5">approved by</th>
                      <th className="p-3.5 pr-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs">
                    {cyclesHistory.map((c) => (
                      <tr key={c.id} className="hover:bg-secondary/10 transition-colors">
                        <td className="p-3.5 pl-5 font-bold text-foreground">
                          {new Date(0, c.month - 1).toLocaleString("en", { month: "long" })} {c.year}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                            c.status === "Locked" 
                              ? "bg-zinc-500/10 border-zinc-500/20 text-zinc-400" 
                              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-mono font-semibold text-foreground">
                          ${c.reward_pool.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right text-muted-foreground font-mono">
                          <div>Dep: ${c.monthly_deposits.toFixed(2)}</div>
                          <div className="text-[10px] text-emerald-500">Hold: ${c.monthly_holding.toFixed(2)}</div>
                        </td>
                        <td className="p-3.5 text-center font-bold text-foreground">
                          {c.total_qualified_players}
                        </td>
                        <td className="p-3.5 text-right font-mono font-black text-emerald-400">
                          ${c.total_distributed_amount.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-muted-foreground font-semibold">
                          {c.approved_by_name}
                        </td>
                        <td className="p-3.5 pr-5 text-center">
                          <Button
                            onClick={() => setSelectedCycle(c)}
                            size="sm"
                            className="bg-secondary text-foreground hover:bg-muted font-bold text-[10px] h-8 rounded-lg"
                          >
                            View details
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {cyclesHistory.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-12 text-center text-xs text-muted-foreground font-semibold select-none">
                          No completed monthly reward cycles found matching the filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm text-left">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1100px]">
                  <thead>
                    <tr className="border-b border-border/80 bg-secondary/35 text-[10px] uppercase tracking-wider text-muted-foreground font-bold select-none">
                      <th className="p-3.5 pl-5">Player Profile</th>
                      <th className="p-3.5 text-center">Period</th>
                      <th className="p-3.5 text-center">VIP Rank</th>
                      <th className="p-3.5 text-right">Deposit Score</th>
                      <th className="p-3.5 text-right">Holding Score</th>
                      <th className="p-3.5 text-right">referral score</th>
                      <th className="p-3.5 text-right">loyalty score</th>
                      <th className="p-3.5 text-right">base score</th>
                      <th className="p-3.5 text-right">vip mult</th>
                      <th className="p-3.5 text-right">final score</th>
                      <th className="p-3.5 text-right font-black text-emerald-400">Reward amount</th>
                      <th className="p-3.5 pr-5">Distribution Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs font-medium">
                    {playersHistory.map((p) => (
                      <tr key={p.id} className="hover:bg-secondary/10 transition-colors">
                        <td className="p-3.5 pl-5">
                          <span className="font-bold text-sm text-foreground">@{p.username}</span>
                        </td>
                        <td className="p-3.5 text-center font-bold text-muted-foreground font-mono">
                          {p.month}/{p.year}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-secondary text-[10px] font-black uppercase text-foreground">
                            {p.vip_status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-mono text-muted-foreground">{Number(p.deposit_score).toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono text-muted-foreground">{Number(p.holding_score).toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono text-muted-foreground">{Number(p.referral_score).toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono text-muted-foreground">{Number(p.loyalty_score).toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono text-muted-foreground">{Number(p.base_score).toFixed(2)}%</td>
                        <td className="p-3.5 text-right font-mono text-muted-foreground">{Number(p.multiplier).toFixed(2)}x</td>
                        <td className="p-3.5 text-right font-mono text-muted-foreground font-semibold text-foreground">{Number(p.final_score).toFixed(4)}%</td>
                        <td className="p-3.5 text-right font-mono font-black text-emerald-400 text-sm">
                          ${Number(p.reward_amount).toFixed(2)}
                        </td>
                        <td className="p-3.5 pr-5 text-muted-foreground font-mono">
                          {new Date(p.distribution_date).toLocaleString()}
                        </td>
                      </tr>
                    ))}

                    {playersHistory.length === 0 && (
                      <tr>
                        <td colSpan={12} className="p-12 text-center text-xs text-muted-foreground font-semibold select-none">
                          No historical payout transactions found matching the filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detailed Cycle Overlay Modal */}
          {selectedCycle && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
              <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 max-w-3xl w-full shadow-2xl animate-in zoom-in-95 duration-200 text-left flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center border-b border-neutral-800/80 pb-4 mb-4 select-none shrink-0">
                  <div>
                    <h3 className="text-lg font-black text-foreground">
                      Cycle details: {new Date(0, selectedCycle.month - 1).toLocaleString("en", { month: "long" })} {selectedCycle.year}
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-0.5">
                      Status: {selectedCycle.status} | ID: {selectedCycle.id}
                    </p>
                  </div>
                  <Button
                    onClick={() => setSelectedCycle(null)}
                    variant="outline"
                    className="h-8 rounded-lg border-neutral-800 text-neutral-400 text-xs font-bold px-3.5"
                  >
                    Close
                  </Button>
                </div>

                <div className="overflow-y-auto space-y-6 flex-1 pr-1.5 scrollbar-thin">
                  {/* Configuration Summary Card */}
                  <div className="bg-neutral-900 border border-neutral-800/60 rounded-2xl p-5 space-y-4">
                    <h4 className="font-extrabold text-xs text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Settings className="h-4 w-4 shrink-0 text-primary" />
                      <span>Calculation Configuration Rules</span>
                    </h4>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-semibold text-neutral-300">
                      <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/40">
                        <div className="text-[9px] text-neutral-500 uppercase">Deposit Weight</div>
                        <div className="text-sm font-bold text-neutral-200 mt-0.5">{selectedCycle.configuration.deposit_weight}%</div>
                      </div>
                      <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/40">
                        <div className="text-[9px] text-neutral-500 uppercase">Holding Weight</div>
                        <div className="text-sm font-bold text-neutral-200 mt-0.5">{selectedCycle.configuration.holding_weight}%</div>
                      </div>
                      <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/40">
                        <div className="text-[9px] text-neutral-500 uppercase">Referral Weight</div>
                        <div className="text-sm font-bold text-neutral-200 mt-0.5">{selectedCycle.configuration.referral_weight}%</div>
                      </div>
                      <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/40">
                        <div className="text-[9px] text-neutral-500 uppercase">Loyalty Weight</div>
                        <div className="text-sm font-bold text-neutral-200 mt-0.5">{selectedCycle.configuration.loyalty_weight}%</div>
                      </div>
                      <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/40">
                        <div className="text-[9px] text-neutral-500 uppercase">Reward Pool %</div>
                        <div className="text-sm font-bold text-neutral-200 mt-0.5">{selectedCycle.configuration.reward_pool_percentage}%</div>
                      </div>
                      <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/40">
                        <div className="text-[9px] text-neutral-500 uppercase">Cap Allocation</div>
                        <div className="text-sm font-bold text-neutral-200 mt-0.5">{selectedCycle.configuration.reward_cap_percentage}%</div>
                      </div>
                      <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/40">
                        <div className="text-[9px] text-neutral-500 uppercase">Min Monthly Deposit</div>
                        <div className="text-sm font-bold text-neutral-200 mt-0.5">${selectedCycle.configuration.min_monthly_deposit}</div>
                      </div>
                      <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/40">
                        <div className="text-[9px] text-neutral-500 uppercase">Min Holding Req</div>
                        <div className="text-sm font-bold text-neutral-200 mt-0.5">${selectedCycle.configuration.min_holding_requirement}</div>
                      </div>
                    </div>
                  </div>

                  {/* Logs Section */}
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 bg-neutral-900 border-b border-neutral-800 text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5 select-none">
                      <Terminal className="h-4 w-4 text-emerald-400" />
                      <span>Historical Calculation Logs</span>
                    </div>
                    <div className="p-4 font-mono text-[10px] text-neutral-400 text-left leading-relaxed space-y-1.5 max-h-56 overflow-y-auto bg-neutral-950">
                      {selectedCycle.logs && selectedCycle.logs.map((log: string, idx: number) => (
                        <div key={idx} className="whitespace-pre-wrap select-text">
                          <span className="text-neutral-600 select-none mr-2">[{idx + 1}]</span>
                          <span>{log}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "audit" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="text-left space-y-1">
              <h3 className="text-lg font-black text-foreground">VIP Audit Trail logs</h3>
              <p className="text-xs text-muted-foreground">Permanent, append-only history of system setting updates and admin actions.</p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Action Type</label>
                <select
                  value={auditFilterAction}
                  onChange={(e) => setAuditFilterAction(e.target.value)}
                  className="w-full h-10 bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground font-semibold outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Actions</option>
                  <option value="reward_settings_changed">Settings Updated</option>
                  <option value="calculation_started">Calculation Started</option>
                  <option value="calculation_completed">Calculation Completed</option>
                  <option value="calculation_failed">Calculation Failed</option>
                  <option value="draft_saved">Draft Saved</option>
                  <option value="reward_recalculated">Reward Recalculated</option>
                  <option value="submit_for_review">Submitted Review</option>
                  <option value="reward_approved">Approved</option>
                  <option value="reward_rejected">Rejected</option>
                  <option value="month_locked">Locked Month</option>
                  <option value="wallet_distribution_executed">Distribution Executed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Admin Username</label>
                <div className="relative">
                  <Input
                    value={auditFilterUsername}
                    onChange={(e) => setAuditFilterUsername(e.target.value)}
                    placeholder="Search admin..."
                    className="bg-secondary text-xs pl-8 h-10 border-border"
                  />
                  <Search className="absolute left-2.5 top-3.5 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Role</label>
                <select
                  value={auditFilterRole}
                  onChange={(e) => setAuditFilterRole(e.target.value)}
                  className="w-full h-10 bg-secondary border border-border rounded-xl px-3 py-1.5 text-xs text-foreground font-semibold outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Roles</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 select-none">Export Audit Trail</label>
                <div className="flex gap-2">
                  <Button
                    onClick={() => exportAuditLogs(auditLogs, "csv")}
                    disabled={auditLogs.length === 0}
                    variant="outline"
                    className="flex-1 h-10 text-[10px] font-bold uppercase rounded-xl border-border bg-secondary/50 hover:bg-secondary"
                  >
                    <Download className="h-3 w-3 mr-1" /> CSV
                  </Button>
                  <Button
                    onClick={() => exportAuditLogs(auditLogs, "excel")}
                    disabled={auditLogs.length === 0}
                    variant="outline"
                    className="flex-1 h-10 text-[10px] font-bold uppercase rounded-xl border-border bg-secondary/50 hover:bg-secondary"
                  >
                    <FileText className="h-3 w-3 mr-1" /> XLS
                  </Button>
                  <Button
                    onClick={() => exportAuditLogs(auditLogs, "pdf")}
                    disabled={auditLogs.length === 0}
                    variant="outline"
                    className="flex-1 h-10 text-[10px] font-bold uppercase rounded-xl border-border bg-secondary/50 hover:bg-secondary"
                  >
                    <FileText className="h-3 w-3 mr-1" /> PDF
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          {loadingAudit ? (
            <div className="bg-card border border-border/80 rounded-2xl p-16 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground font-medium select-none">Loading audit trail logs...</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm text-left">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="border-b border-border/80 bg-secondary/35 text-[10px] uppercase tracking-wider text-muted-foreground font-bold select-none">
                      <th className="p-3.5 pl-5">Timestamp</th>
                      <th className="p-3.5">Admin Username</th>
                      <th className="p-3.5 text-center">Role</th>
                      <th className="p-3.5">Action Executed</th>
                      <th className="p-3.5 text-center">IP Address</th>
                      <th className="p-3.5">Device Information</th>
                      <th className="p-3.5 pr-5 text-center">Payload Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs font-semibold text-neutral-300">
                    {auditLogs.map((l) => (
                      <React.Fragment key={l.id}>
                        <tr className="hover:bg-secondary/10 transition-colors">
                          <td className="p-3.5 pl-5 font-mono text-muted-foreground select-none">
                            {new Date(l.created_at).toLocaleString()}
                          </td>
                          <td className="p-3.5 font-bold text-foreground">
                            @{l.username}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                              l.role === "super_admin" 
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-500" 
                                : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                            }`}>
                              {l.role}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold">
                            <span className="text-foreground bg-secondary/40 px-2 py-1 rounded-lg border border-border/40 font-mono text-[10px]">
                              {l.action}
                            </span>
                          </td>
                          <td className="p-3.5 text-center font-mono text-muted-foreground select-all">
                            {l.ip_address || "N/A"}
                          </td>
                          <td className="p-3.5 text-muted-foreground text-[10px] leading-tight max-w-[200px] truncate" title={l.device_info}>
                            {l.device_info || "N/A"}
                          </td>
                          <td className="p-3.5 pr-5 text-center">
                            {(l.previous_value || l.new_value) ? (
                              <Button
                                onClick={() => setLogsExpanded(prev => prev === l.id ? "" : l.id)}
                                size="sm"
                                variant="outline"
                                className="h-7 text-[9px] font-bold uppercase rounded-lg border-border"
                              >
                                {logsExpanded === l.id ? "Hide details" : "Show details"}
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-bold">—</span>
                            )}
                          </td>
                        </tr>

                        {logsExpanded === l.id && (
                          <tr className="bg-secondary/5">
                            <td colSpan={7} className="p-4 pl-8 border-b border-border/40">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                                {l.previous_value && (
                                  <div className="bg-neutral-950 border border-neutral-900 rounded-xl p-3 text-left">
                                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-2">Previous value data</div>
                                    <pre className="text-[10px] leading-relaxed text-zinc-400 overflow-x-auto select-all max-h-48 p-1 scrollbar-thin">
                                      {JSON.stringify(l.previous_value, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {l.new_value && (
                                  <div className="bg-neutral-950 border border-neutral-900 rounded-xl p-3 text-left">
                                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-2">New value payload</div>
                                    <pre className="text-[10px] leading-relaxed text-zinc-400 overflow-x-auto select-all max-h-48 p-1 scrollbar-thin">
                                      {JSON.stringify(l.new_value, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}

                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-xs text-muted-foreground font-semibold select-none">
                          No audit trail events found matching the filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {showPayoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-500 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold text-neutral-100">
                  Confirm Payout Execution
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed font-semibold">
                  WARNING: You are about to credit user wallets and insert transaction logs. This action is <span className="text-destructive underline font-bold uppercase">irreversible</span>.
                </p>
              </div>
            </div>

            {dbRun && (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 space-y-2.5 text-xs text-neutral-300">
                <div className="flex justify-between font-medium">
                  <span className="text-neutral-500 uppercase tracking-wider text-[10px]">Reward Period</span>
                  <span className="font-bold text-neutral-200">
                    {new Date(0, (dbRun.month || simMonth) - 1).toLocaleString("en", { month: "long" })} {dbRun.year || simYear}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-neutral-500 uppercase tracking-wider text-[10px]">Reward Pool Size</span>
                  <span className="font-bold text-primary">${Number(dbRun.reward_pool).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-neutral-500 uppercase tracking-wider text-[10px]">Qualified Players</span>
                  <span className="font-bold text-neutral-200">{dbRun.total_qualified_users}</span>
                </div>
                <div className="flex justify-between font-medium border-t border-neutral-800/80 pt-2">
                  <span className="text-neutral-500 uppercase tracking-wider text-[10px]">Total Distributed</span>
                  <span className="font-bold text-emerald-400">${Number(dbRun.total_distributed_rewards).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPayoutConfirm(false)}
                className="h-10 px-5 border-neutral-800 hover:bg-neutral-900 font-bold text-xs uppercase"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleExecutePayouts}
                className="h-10 px-6 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase shadow-lg shadow-amber-950/40"
              >
                Execute Payouts
              </Button>
            </div>
          </div>
        </div>
      )}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-500 shrink-0">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold text-neutral-100">
                  Reset Settings Configurations?
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed font-semibold">
                  Are you sure you want to reset all configurations on this page? This will discard your current unsaved modifications and revert the fields back to the settings stored in the database.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowResetConfirm(false)}
                className="h-10 px-5 border-neutral-800 hover:bg-neutral-900 font-bold text-xs uppercase"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  loadSettings();
                  setShowResetConfirm(false);
                  toast.success("Configurations successfully reset to saved values.");
                }}
                className="h-10 px-6 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase shadow-lg shadow-rose-950/40"
              >
                Confirm Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
