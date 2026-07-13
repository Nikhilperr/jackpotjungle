import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Settings, ShieldCheck, Percent, Scale, Coins, Calendar, Award, UserPlus, Save, Play, Sparkles, Terminal, ChevronDown, ChevronUp, TrendingUp, Crown } from "lucide-react";
import { getVipRewardSettings, updateVipRewardSettings } from "@/lib/api/vip-settings.functions";
import { runVipRewardSimulation } from "@/lib/api/vip-reward-engine/engine.functions";
import { getVipRewardRun, saveVipRewardRunDraft, updateVipRewardRunStatus, executeVipRewardRunPayouts } from "@/lib/api/vip-reward-engine/approval.functions";
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

  const [activeTab, setActiveTab] = useState<"settings" | "simulation">("settings");
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

  const fetchActiveRun = async (m: number, y: number) => {
    setLoadingRun(true);
    setDbRun(null);
    setSimResult(null);
    setSimError(null);
    try {
      const res = await getRunFn({ data: { month: m, year: y } });
      if (res.success && res.run) {
        setDbRun(res.run);
        setSimResult({
          pool_size: Number(res.run.reward_pool),
          total_qualified_users: res.run.total_qualified_users,
          total_distributed_rewards: Number(res.run.total_distributed_rewards),
          execution_time_ms: 0,
          configuration: res.run.configuration,
          user_results: res.run.player_results,
          logs: res.run.logs,
        });
      }
    } catch (err: any) {
      console.error("Failed to load active run state:", err.message);
    } finally {
      setLoadingRun(false);
    }
  };

  useEffect(() => {
    if (activeTab === "simulation") {
      fetchActiveRun(simMonth, simYear);
    }
  }, [activeTab, simMonth, simYear]);

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
      const res = await loadFn();
      if (res.success && res.settings) {
        const s = res.settings;
        setRewardPoolPercentage(String(s.reward_pool_percentage));
        setDepositWeight(String(s.deposit_weight));
        setHoldingWeight(String(s.holding_weight));
        setReferralWeight(String(s.referral_weight));
        setLoyaltyWeight(String(s.loyalty_weight));
        setRewardCapPercentage(String(s.reward_cap_percentage));
        setMinMonthlyDeposit(String(s.min_monthly_deposit));
        setMinHoldingRequirement(String(s.min_holding_requirement));
        setDistributionDate(String(s.distribution_date));
        
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
      const res = await saveFn({
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
      });

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
      const res = await runSimFn({
        data: {
          month: Number(simMonth),
          year: Number(simYear),
          isSimulation: true,
        }
      });
      if (res.success && res.result) {
        if (res.result.status === "error") {
          setSimError(res.result.error_message || "An unexpected error occurred during execution.");
        } else {
          setSimResult(res.result);
          // Save calculation results to database
          const saveRes = await saveDraftFn({
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
          });
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
      const res = await updateStatusFn({
        data: {
          runId: dbRun.id,
          status: targetStatus,
        }
      });
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
    const confirmExec = window.confirm("WARNING: You are about to credit user wallets and insert transaction logs. This action is irreversible. Do you want to proceed?");
    if (!confirmExec) return;

    setWorkflowProcessing(true);
    try {
      const res = await executePayoutsFn({
        data: {
          runId: dbRun.id,
        }
      });
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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      
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
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold border border-amber-500/20 shadow-sm shrink-0">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>SUPER ADMIN AUTHORIZED ONLY</span>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-border/60 select-none pb-0.5 mb-2">
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

        {/* Action Button */}
        <div className="flex justify-end pt-4">
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
                  {Array.from({ length: 7 }, (_, i) => 2024 + i).map((y) => (
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
                            onClick={handleExecutePayouts}
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
    </div>
  );
}
