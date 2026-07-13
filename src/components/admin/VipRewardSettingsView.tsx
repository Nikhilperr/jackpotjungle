import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Settings, ShieldCheck, Percent, Scale, Coins, Calendar, Award, UserPlus, Save } from "lucide-react";
import { getVipRewardSettings, updateVipRewardSettings } from "@/lib/api/vip-settings.functions";
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form Fields State
  const [rewardPoolPercentage, setRewardPoolPercentage] = useState(5.0);
  const [depositWeight, setDepositWeight] = useState(35.0);
  const [holdingWeight, setHoldingWeight] = useState(30.0);
  const [referralWeight, setReferralWeight] = useState(15.0);
  const [loyaltyWeight, setLoyaltyWeight] = useState(20.0);
  const [rewardCapPercentage, setRewardCapPercentage] = useState(10.0);
  const [minMonthlyDeposit, setMinMonthlyDeposit] = useState(100.0);
  const [minHoldingRequirement, setMinHoldingRequirement] = useState(50.0);
  const [distributionDate, setDistributionDate] = useState(1);

  // Multipliers State
  const [bronze, setBronze] = useState(1.00);
  const [silver, setSilver] = useState(1.05);
  const [gold, setGold] = useState(1.10);
  const [platinum, setPlatinum] = useState(1.20);
  const [diamond, setDiamond] = useState(1.30);
  const [blackDiamond, setBlackDiamond] = useState(1.50);

  // Referral Rules State
  const [minReferredDeposit, setMinReferredDeposit] = useState(50.0);
  const [requiresVerification, setRequiresVerification] = useState(false);

  // Load active configurations from db
  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await loadFn();
      if (res.success && res.settings) {
        const s = res.settings;
        setRewardPoolPercentage(Number(s.reward_pool_percentage));
        setDepositWeight(Number(s.deposit_weight));
        setHoldingWeight(Number(s.holding_weight));
        setReferralWeight(Number(s.referral_weight));
        setLoyaltyWeight(Number(s.loyalty_weight));
        setRewardCapPercentage(Number(s.reward_cap_percentage));
        setMinMonthlyDeposit(Number(s.min_monthly_deposit));
        setMinHoldingRequirement(Number(s.min_holding_requirement));
        setDistributionDate(Number(s.distribution_date));
        
        // Multipliers
        if (s.vip_multipliers) {
          setBronze(Number(s.vip_multipliers.bronze ?? 1.0));
          setSilver(Number(s.vip_multipliers.silver ?? 1.05));
          setGold(Number(s.vip_multipliers.gold ?? 1.10));
          setPlatinum(Number(s.vip_multipliers.platinum ?? 1.20));
          setDiamond(Number(s.vip_multipliers.diamond ?? 1.30));
          setBlackDiamond(Number(s.vip_multipliers.black_diamond ?? 1.50));
        }

        // Referral rules
        if (s.referral_qualification_rules) {
          setMinReferredDeposit(Number(s.referral_qualification_rules.min_referred_deposit ?? 50.0));
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
  const weightsSum = Number(depositWeight) + Number(holdingWeight) + Number(referralWeight) + Number(loyaltyWeight);
  const isWeightsValid = Math.abs(weightsSum - 100) < 0.001;

  // Handle Form Submission
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validation checks
    if (!isWeightsValid) {
      toast.error(`Score weights must sum to exactly 100 points. (Current Sum: ${weightsSum})`);
      return;
    }
    if (rewardPoolPercentage < 0 || rewardPoolPercentage > 100) {
      toast.error("Reward Pool Percentage must be between 0% and 100%.");
      return;
    }
    if (rewardCapPercentage < 0 || rewardCapPercentage > 100) {
      toast.error("Reward Cap Percentage must be between 0% and 100%.");
      return;
    }
    if (distributionDate < 1 || distributionDate > 28) {
      toast.error("Distribution Day of Month must be between 1 and 28.");
      return;
    }

    setSaving(true);
    try {
      const res = await saveFn({
        rewardPoolPercentage,
        depositWeight,
        holdingWeight,
        referralWeight,
        loyaltyWeight,
        rewardCapPercentage,
        minMonthlyDeposit,
        minHoldingRequirement,
        distributionDate,
        vipMultipliers: {
          bronze,
          silver,
          gold,
          platinum,
          diamond,
          black_diamond: blackDiamond,
        },
        referralQualificationRules: {
          min_referred_deposit: minReferredDeposit,
          requires_verification: requiresVerification,
        },
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
                onChange={(e) => setRewardPoolPercentage(Math.max(0, Math.min(100, Number(e.target.value))))}
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
                onChange={(e) => setRewardCapPercentage(Math.max(0, Math.min(100, Number(e.target.value))))}
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
                onChange={(e) => setDepositWeight(Math.max(0, Number(e.target.value)))}
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
                onChange={(e) => setHoldingWeight(Math.max(0, Number(e.target.value)))}
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
                onChange={(e) => setReferralWeight(Math.max(0, Number(e.target.value)))}
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
                onChange={(e) => setLoyaltyWeight(Math.max(0, Number(e.target.value)))}
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
                onChange={(e) => setMinMonthlyDeposit(Math.max(0, Number(e.target.value)))}
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
                onChange={(e) => setMinHoldingRequirement(Math.max(0, Number(e.target.value)))}
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
                onChange={(e) => setDistributionDate(Math.max(1, Math.min(28, Number(e.target.value))))}
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
              <Input id="vipBronze" type="number" step="0.01" min="0" value={bronze} onChange={(e) => setBronze(Math.max(0, Number(e.target.value)))} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipSilver" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Silver</span>
                <HelpTooltip content="Reward multiplier for the Silver VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipSilver" type="number" step="0.01" min="0" value={silver} onChange={(e) => setSilver(Math.max(0, Number(e.target.value)))} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipGold" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Gold</span>
                <HelpTooltip content="Reward multiplier for the Gold VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipGold" type="number" step="0.01" min="0" value={gold} onChange={(e) => setGold(Math.max(0, Number(e.target.value)))} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipPlatinum" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Platinum</span>
                <HelpTooltip content="Reward multiplier for the Platinum VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipPlatinum" type="number" step="0.01" min="0" value={platinum} onChange={(e) => setPlatinum(Math.max(0, Number(e.target.value)))} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipDiamond" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Diamond</span>
                <HelpTooltip content="Reward multiplier for the Diamond VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipDiamond" type="number" step="0.01" min="0" value={diamond} onChange={(e) => setDiamond(Math.max(0, Number(e.target.value)))} required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vipBlackDiamond" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center">
                <span>Black Diamond</span>
                <HelpTooltip content="Reward multiplier for the Black Diamond VIP tier. A higher multiplier increases the tier's reward payout size." />
              </label>
              <Input id="vipBlackDiamond" type="number" step="0.01" min="0" value={blackDiamond} onChange={(e) => setBlackDiamond(Math.max(0, Number(e.target.value)))} required />
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
                onChange={(e) => setMinReferredDeposit(Math.max(0, Number(e.target.value)))}
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
    </div>
  );
}
