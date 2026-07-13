import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { toast } from "sonner";
import { Award, Loader2, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserRewardHistory } from "@/lib/api/vip-reward-engine/history.functions";
import { getUserVipDashboardStats } from "@/lib/api/vip-reward-engine/dashboard.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/app/_authenticated/vip-rewards")({
  ssr: false,
  head: () => ({ meta: [{ title: "VIP Rewards — JJ Messenger" }] }),
  component: VipRewardsPage,
});

export function getVipBadgeUrl(status: string | null | undefined): string | null {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  if (normalized === "platinum") return "/platium.png";
  if (normalized === "diamond") return "/dimond.png";
  if (normalized === "black_diamond" || normalized === "blackvip") return "/blackvip.png";
  return `/${normalized}.png`;
}

export function getVipBadgeStyles(status: string | null | undefined) {
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

function VipRewardsPage() {
  const { user, loading: authLoading } = useAuth();

  const getVipHistoryFn = useServerFn(getUserRewardHistory);
  const getVipStatsFn = useServerFn(getUserVipDashboardStats);
  const [vipRewardsHistory, setVipRewardsHistory] = useState<any[]>([]);
  const [loadingVipHistory, setLoadingVipHistory] = useState(false);
  const [vipDashboardStats, setVipDashboardStats] = useState<any>(null);
  const [loadingVipDashboard, setLoadingVipDashboard] = useState(false);
  const [vipHistoryPage, setVipHistoryPage] = useState(1);

  const loadVipHistory = async () => {
    setLoadingVipHistory(true);
    setLoadingVipDashboard(true);
    try {
      const historyRes = await getVipHistoryFn();
      if (historyRes.success && historyRes.history) {
        setVipRewardsHistory(historyRes.history);
      }
      const statsRes = await getVipStatsFn();
      if (statsRes.success) {
        setVipDashboardStats(statsRes);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load VIP history");
    } finally {
      setLoadingVipHistory(false);
      setLoadingVipDashboard(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadVipHistory();
    }
  }, [user]);

  if (authLoading || !user) {
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
          <h1 className="font-bold">VIP Rewards</h1>
        </div>

        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          <div className="bg-secondary rounded-2xl p-5 space-y-3 text-left">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Award className="h-5 w-5 text-primary animate-pulse" /> Monthly VIP Loyalty Payouts
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your VIP status tracker and historical rewards distributed at the end of each monthly calculations cycle.
            </p>
          </div>

          {loadingVipHistory || loadingVipDashboard ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* VIP Dashboard Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Monthly Reward Estimator Card */}
                <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Current Month Reward</span>
                    {vipDashboardStats?.activeMonthEstimate ? (
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        vipDashboardStats.activeMonthEstimate.status === "Approved" || vipDashboardStats.activeMonthEstimate.status === "Completed"
                          ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                          : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                      }`}>
                        {vipDashboardStats.activeMonthEstimate.status}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-secondary text-muted-foreground border border-border">
                        Calculating
                      </span>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="text-2xl font-black text-foreground font-mono">
                      ${vipDashboardStats?.activeMonthEstimate ? Number(vipDashboardStats.activeMonthEstimate.rewardAmount).toFixed(2) : "0.00"}
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {vipDashboardStats?.activeMonthEstimate?.qualified
                        ? `Score: ${vipDashboardStats.activeMonthEstimate.finalScore.toFixed(4)}% | Multiplier: ${vipDashboardStats.activeMonthEstimate.multiplier.toFixed(2)}x`
                        : vipDashboardStats?.activeMonthEstimate?.disqualificationReason || "Qualified deposits & positive holding required."}
                    </p>
                  </div>
                  <div className="text-[9px] text-muted-foreground border-t border-border/50 pt-2 flex items-center justify-between">
                    <span>Expected Distribution Date:</span>
                    <span className="font-bold text-foreground">1st of next month</span>
                  </div>
                </div>

                {/* 2. VIP level card and progress */}
                <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">VIP Tier Progression</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                      {vipDashboardStats?.progression?.currentTier || "NONE"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground font-medium">Progress to {vipDashboardStats?.progression?.nextTier}</span>
                      <span className="font-bold text-foreground font-mono">{vipDashboardStats?.progression?.progressPercentage || 0}%</span>
                    </div>
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-500 rounded-full"
                        style={{ width: `${vipDashboardStats?.progression?.progressPercentage || 0}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="text-[10px] text-muted-foreground leading-relaxed">
                    {vipDashboardStats?.progression?.remainingDeposits > 0 ? (
                      `Deposit $${vipDashboardStats.progression.remainingDeposits.toLocaleString()} more to reach ${vipDashboardStats.progression.nextTier}.`
                    ) : (
                      <div className="space-y-0.5">
                        <p>Maximum VIP tier achieved! Enjoy premium benefits.</p>
                        <p className="text-[9px] opacity-75 font-medium italic">
                          (Maxed out. Stay tuned, new VIP badges and tiers will be introduced in the future!)
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="text-[9px] border-t border-border/50 pt-2 text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 font-semibold">
                    {vipDashboardStats?.progression?.benefits?.map((benefit: string, idx: number) => (
                      <span key={idx} className="flex items-center gap-1">
                        <span className="h-1 w-1 bg-primary rounded-full shrink-0"></span> {benefit}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 3. Referral Progress Card */}
                <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Referral Stats</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-secondary text-foreground">
                      {vipDashboardStats?.referrals?.qualified || 0} Qualified
                    </span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-foreground font-mono">
                      {vipDashboardStats?.referrals?.total || 0} Referrals
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Qualified referrals registered and deposited at least ${vipDashboardStats?.referrals?.minRequiredDeposit || 50}.
                    </p>
                  </div>
                  <div className="text-[9px] text-muted-foreground border-t border-border/50 pt-2">
                    Earn referral score weights to increase monthly rewards score.
                  </div>
                </div>

                {/* 4. Wallet Balances Summary Card */}
                <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Available & Credits Balance</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Active
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-left">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Available</span>
                      <span className="text-base font-bold text-foreground font-mono">
                        ${vipDashboardStats?.profile?.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Credits</span>
                      <span className="text-base font-bold text-primary font-mono">
                        ${vipDashboardStats?.profile?.creditBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="text-[9px] text-muted-foreground border-t border-border/50 pt-2">
                    Rewards distributed are automatically credited to your Available Balance.
                  </div>
                </div>

              </div>

              {/* Reward Payout History Table */}
              <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-border/50 bg-secondary/15 flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <History className="h-4 w-4 text-primary" /> Reward Payout History
                  </h4>
                  <span className="text-[10px] text-muted-foreground font-semibold font-mono">
                    {vipRewardsHistory.length} total entries
                  </span>
                </div>

                {vipRewardsHistory.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center text-muted-foreground text-center p-6 select-none bg-secondary/10">
                    <Award className="h-7 w-7 opacity-30 mb-2" />
                    <p className="text-xs font-bold text-foreground">No VIP rewards found</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-xs mx-auto">
                      Complete qualified deposits and maintain positive holding to earn loyalty rewards next cycle!
                    </p>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                        <thead>
                          <tr className="border-b border-border/80 bg-secondary/35 text-[10px] uppercase font-bold text-muted-foreground">
                            <th className="p-3 pl-5">Cycle Period</th>
                            <th className="p-3 text-center">VIP Tier</th>
                            <th className="p-3 text-right">Scores (Dep/Hold/Ref/Loy)</th>
                            <th className="p-3 text-right">VIP Multiplier</th>
                            <th className="p-3 text-right">Final Score</th>
                            <th className="p-3 text-right text-emerald-400">Reward amount</th>
                            <th className="p-3 pr-5">Distribution Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {vipRewardsHistory
                            .slice((vipHistoryPage - 1) * 5, vipHistoryPage * 5)
                            .map((row) => (
                              <tr key={row.id} className="hover:bg-secondary/10 transition-colors">
                                <td className="p-3 pl-5 font-bold text-foreground">
                                  {new Date(0, row.month - 1).toLocaleString("en", { month: "long" })} {row.year}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="px-2 py-0.5 rounded bg-secondary text-[10px] font-black uppercase text-foreground">
                                    {row.vip_status}
                                  </span>
                                </td>
                                <td className="p-3 text-right text-[10px] font-mono text-muted-foreground">
                                  Dep: {Number(row.deposit_score).toFixed(0)} | Hold: {Number(row.holding_score).toFixed(0)} | Ref: {Number(row.referral_score).toFixed(0)} | Loy: {Number(row.loyalty_score).toFixed(0)}
                                </td>
                                <td className="p-3 text-right font-mono text-muted-foreground font-semibold">
                                  {Number(row.multiplier).toFixed(2)}x
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-foreground">
                                  {Number(row.final_score).toFixed(4)}%
                                </td>
                                <td className="p-3 text-right font-mono font-black text-emerald-400 text-sm">
                                  ${Number(row.reward_amount).toFixed(2)}
                                </td>
                                <td className="p-3 pr-5 font-mono text-muted-foreground">
                                  {new Date(row.distribution_date).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Client-side Pagination controls */}
                    {vipRewardsHistory.length > 5 && (
                      <div className="flex items-center justify-between p-3 bg-secondary/5 border-t border-border/50 text-[10px]">
                        <span className="text-muted-foreground">
                          Showing page {vipHistoryPage} of {Math.ceil(vipRewardsHistory.length / 5)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setVipHistoryPage(p => Math.max(1, p - 1))}
                            disabled={vipHistoryPage === 1}
                            className="px-2 py-1 rounded bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50 transition-all"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setVipHistoryPage(p => Math.min(Math.ceil(vipRewardsHistory.length / 5), p + 1))}
                            disabled={vipHistoryPage === Math.ceil(vipRewardsHistory.length / 5)}
                            className="px-2 py-1 rounded bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50 transition-all"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      </div>
    </AppShell>
  );
}
