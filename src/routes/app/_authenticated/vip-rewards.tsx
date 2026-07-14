import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Award, Loader2, History, Users, Crown, HelpCircle, ChevronRight, Percent, Zap, Gift, Headphones, Star, Share2, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserRewardHistory } from "@/lib/api/vip-reward-engine/history.functions";
import { getUserVipDashboardStats } from "@/lib/api/vip-reward-engine/dashboard.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/app/_authenticated/vip-rewards")({
  ssr: false,
  head: () => ({ meta: [{ title: "VIP Club — JJ Messenger" }] }),
  component: VipRewardsPage,
});

export function getVipBadgeUrl(status: string | null | undefined): string {
  if (!status || status === "none") return "/bronze.png";
  const normalized = status.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.includes("black")) return "/blackvip.png";
  if (normalized.includes("platinum") || normalized.includes("platium")) return "/platium.png";
  if (normalized.includes("diamond") || normalized.includes("dimond")) return "/dimond.png";
  if (normalized.includes("gold")) return "/gold.png";
  if (normalized.includes("silver")) return "/silver.png";
  if (normalized.includes("bronze")) return "/bronze.png";
  return "/bronze.png";
}

export function getVipTheme(status: string | null | undefined) {
  const normalized = status ? status.toLowerCase() : "none";
  if (normalized.includes("black")) {
    return {
      border: "border-purple-500/40",
      text: "from-purple-400 via-fuchsia-200 to-purple-500",
      progress: "from-purple-600 to-fuchsia-500",
      bgGlow: "bg-purple-500/5",
    };
  }
  if (normalized.includes("diamond") || normalized.includes("dimond")) {
    return {
      border: "border-blue-500/40",
      text: "from-blue-400 via-cyan-200 to-blue-500",
      progress: "from-blue-500 to-cyan-500",
      bgGlow: "bg-blue-500/5",
    };
  }
  if (normalized.includes("platinum") || normalized.includes("platium")) {
    return {
      border: "border-cyan-500/40",
      text: "from-cyan-400 via-teal-200 to-cyan-500",
      progress: "from-cyan-500 to-teal-500",
      bgGlow: "bg-cyan-500/5",
    };
  }
  if (normalized.includes("gold")) {
    return {
      border: "border-yellow-500/50",
      text: "from-yellow-400 via-amber-200 to-yellow-400",
      progress: "from-yellow-500 to-amber-500",
      bgGlow: "bg-yellow-500/5",
    };
  }
  if (normalized.includes("silver")) {
    return {
      border: "border-slate-400/40",
      text: "from-slate-300 via-slate-100 to-slate-400",
      progress: "from-slate-400 to-slate-300",
      bgGlow: "bg-slate-400/5",
    };
  }
  return {
    border: "border-amber-700/40",
    text: "from-amber-600 via-orange-300 to-amber-700",
    progress: "from-amber-600 to-orange-500",
    bgGlow: "bg-amber-700/5",
  };
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
    color = "#a855f7";
  }
  
  return { label, color };
}

function VipRewardsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const getVipHistoryFn = useServerFn(getUserRewardHistory);
  const getVipStatsFn = useServerFn(getUserVipDashboardStats);
  const [vipRewardsHistory, setVipRewardsHistory] = useState<any[]>([]);
  const [loadingVipHistory, setLoadingVipHistory] = useState(false);
  const [vipDashboardStats, setVipDashboardStats] = useState<any>(null);
  const [loadingVipDashboard, setLoadingVipDashboard] = useState(false);
  const [vipHistoryPage, setVipHistoryPage] = useState(1);

  // Referrals list states
  const [referralsModalOpen, setReferralsModalOpen] = useState(false);
  const [referredByProfile, setReferredByProfile] = useState<any>(null);
  const [referralsList, setReferralsList] = useState<any[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);

  const fetchReferralDetails = async () => {
    if (!user) return;
    setLoadingReferrals(true);
    try {
      const { data: myProf } = await supabase
        .from("profiles")
        .select("referred_by")
        .eq("id", user.id)
        .maybeSingle();

      if (myProf?.referred_by) {
        const { data: refBy } = await supabase
          .from("profiles")
          .select("username, first_name, last_name")
          .eq("id", myProf.referred_by)
          .maybeSingle();
        setReferredByProfile(refBy);
      } else {
        setReferredByProfile(null);
      }

      const { data: refs, error: refsErr } = await supabase
        .from("referrals")
        .select("*")
        .eq("referrer_id", user.id);

      if (refsErr) throw refsErr;

      if (refs && refs.length > 0) {
        const referredIds = refs.map((r) => r.referred_id);
        const { data: profs, error: profsErr } = await supabase
          .from("profiles")
          .select("id, username, first_name, last_name, vip_status, avatar_url")
          .in("id", referredIds);

        if (profsErr) throw profsErr;

        const combined = refs.map((r) => {
          const matchedProf = profs?.find((p) => p.id === r.referred_id);
          return {
            id: r.id,
            status: r.status,
            created_at: r.created_at,
            referredUser: matchedProf || { username: "Unknown User" },
          };
        });
        setReferralsList(combined);
      } else {
        setReferralsList([]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load referrals list");
    } finally {
      setLoadingReferrals(false);
    }
  };

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

  const currentTier = vipDashboardStats?.progression?.currentTier || "none";
  const nextTier = vipDashboardStats?.progression?.nextTier || "Bronze";
  const progressPercentage = vipDashboardStats?.progression?.progressPercentage || 0;
  const remainingDeposits = vipDashboardStats?.progression?.remainingDeposits || 100;

  const currentRewardAmount = vipDashboardStats?.activeMonthEstimate 
    ? Number(vipDashboardStats.activeMonthEstimate.rewardAmount).toFixed(2)
    : "0.00";

  const theme = getVipTheme(currentTier);
  const isMaxTier = currentTier.toLowerCase().includes("black") || nextTier.toLowerCase().includes("max") || remainingDeposits <= 0;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto bg-[#0B0C0E] select-none text-left">
        
        {/* Page Header */}
        <div className="p-4 border-b border-border/20 flex items-center justify-between bg-card/40 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <HamburgerButton />
            <h1 className="font-extrabold text-foreground flex items-center gap-2 font-sans text-base">
              <Crown className="h-5 w-5 text-amber-500" />
              <span>VIP Club</span>
            </h1>
          </div>
          <button 
            onClick={() => navigate({ to: "/app/help" })}
            className="h-8 w-8 rounded-full hover:bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Dashboard Frame */}
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
          
          {loadingVipHistory || loadingVipDashboard ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in duration-300">
              
              {/* 1. HERO CARD (Rank Progression & Estimations) */}
              <div className={`rounded-3xl bg-gradient-to-b from-[#1c1d25] to-[#121317] border ${theme.border} p-5 sm:p-6 space-y-5 shadow-xl relative overflow-hidden`}>
                <div className={`absolute top-0 right-0 w-24 h-24 ${theme.bgGlow} rounded-full blur-xl pointer-events-none`} />

                <div className="flex items-start justify-between gap-4">
                  {/* Left Column: Shield Medal Badge */}
                  <div className="flex items-center gap-3.5">
                    <div className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 flex items-center justify-center drop-shadow-[0_8px_16px_rgba(245,158,11,0.25)]">
                      <img 
                        src={getVipBadgeUrl(currentTier)} 
                        alt={`${currentTier} Badge`} 
                        className="max-h-20 sm:max-h-24 w-auto object-contain"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest font-mono">Current Level</span>
                      <h2 className={`text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r ${theme.text} uppercase tracking-tight font-sans`}>
                        {currentTier} VIP
                      </h2>
                      <p className="text-[11px] text-muted-foreground font-semibold">You're a valued member!</p>
                    </div>
                  </div>

                  {/* Right Column: VIP Benefits Pill */}
                  <button 
                    onClick={() => {
                      const el = document.getElementById("vip-benefits-anchor");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="rounded-full bg-[#20212b] border border-border/30 px-3 py-1.5 text-[10px] font-black text-amber-400 hover:text-white flex items-center gap-1 transition-colors shrink-0"
                  >
                    <span>VIP Benefits</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>

                {/* Substats: Current Reward & Next Payout */}
                <div className="grid grid-cols-2 gap-4 bg-[#0a0b0d]/70 rounded-2xl p-4 border border-border/10 font-sans">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Current Reward</span>
                    <span className="text-xl sm:text-2xl font-black text-green-400 font-mono block mt-1">
                      ${currentRewardAmount}
                    </span>
                  </div>
                  <div className="border-l border-border/15 pl-4 space-y-0.5">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Next Payout</span>
                    <span className="text-sm sm:text-base font-extrabold text-foreground block">
                      This Sunday
                    </span>
                    <span className="text-[9px] text-muted-foreground block font-medium">Updates monthly calculations</span>
                  </div>
                </div>

                {/* Segmented Progress bar container */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-muted-foreground">VIP Progress</span>
                    <span className="text-amber-400 font-mono">{progressPercentage}%</span>
                  </div>

                  {/* Segmented Progress: 5 Equal rounded bars filled dynamically */}
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 4].map((idx) => {
                      const segmentProgress = Math.max(0, Math.min(100, ((progressPercentage - idx * 20) / 20) * 100));
                      return (
                        <div key={idx} className="flex-1 bg-[#1e2027] h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full bg-gradient-to-r ${theme.progress} transition-all duration-300`} 
                            style={{ width: `${segmentProgress}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Remaining calculations text */}
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                      {!isMaxTier ? (
                        <span>Deposit <strong className="text-foreground">${remainingDeposits.toLocaleString()}</strong> more to reach <strong className="text-amber-400">{nextTier}</strong></span>
                      ) : (
                        <span>Maximum VIP achieved! Enjoy elite benefits.</span>
                      )}
                    </p>

                    <Link to="/app/wallet" className="shrink-0">
                      <Button className="rounded-full bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-800 hover:to-indigo-700 text-white text-xs font-black h-9 px-4.5 flex items-center gap-1 shadow-md">
                        <span>Deposit Now</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>

              </div>

              {/* 2. VIP BENEFITS ROW */}
              <div id="vip-benefits-anchor" className="rounded-3xl bg-[#121317] border border-border/20 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-sm text-foreground flex items-center gap-1.5">
                    <Percent className="h-4.5 w-4.5 text-primary" />
                    <span>VIP Benefits</span>
                  </h3>
                  <button 
                    onClick={() => navigate({ to: "/app/help" })}
                    className="text-[10px] font-black text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <span>View All</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>

                {/* 5 Icons Row */}
                <div className="grid grid-cols-5 gap-2 text-center">
                  {[
                    { icon: Percent, title: "Higher Cashback", desc: "Up to 30%", color: "text-purple-400 bg-purple-500/10" },
                    { icon: Zap, title: "Faster Withdrawals", desc: "Priority", color: "text-emerald-400 bg-emerald-500/10" },
                    { icon: Gift, title: "Weekly Rewards", desc: "Every Sunday", color: "text-amber-400 bg-amber-500/10" },
                    { icon: Headphones, title: "Priority Support", desc: "24/7", color: "text-blue-400 bg-blue-500/10" },
                    { icon: Star, title: "Exclusive Offers", desc: "VIP Only", color: "text-rose-400 bg-rose-500/10" },
                  ].map((b, idx) => {
                    const Icon = b.icon;
                    return (
                      <div key={idx} className="space-y-2 p-2 bg-[#1c1d25]/40 rounded-2xl border border-border/10 flex flex-col items-center">
                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${b.color} shrink-0`}>
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="space-y-0.5 select-none">
                          <p className="text-[8px] font-black text-foreground uppercase tracking-tight block leading-tight">{b.title.split(" ")[0]}</p>
                          <p className="text-[7px] font-bold text-muted-foreground block leading-none">{b.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. INVITE FRIENDS & EARN CARD */}
              <div className="rounded-3xl bg-[#121317] border border-border/20 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-sm text-foreground flex items-center gap-1.5 font-sans">
                    <Users className="h-4.5 w-4.5 text-primary" />
                    <span>Invite Friends & Earn</span>
                  </h3>
                  <button 
                    onClick={() => {
                      fetchReferralDetails();
                      setReferralsModalOpen(true);
                    }}
                    className="text-[10px] font-black text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <span>View Referrals</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 bg-[#0a0b0d]/50 border border-border/10 rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-black text-green-400 font-mono leading-none">
                      {vipDashboardStats?.referrals?.total || 0}
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-foreground">Friends Joined</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                        Earn $10 for every qualified referral
                      </p>
                    </div>
                  </div>

                  <Button 
                    onClick={() => {
                      const refLink = window.location.origin + `/app/auth?ref=${user.id}`;
                      navigator.clipboard.writeText(refLink);
                      toast.success("Referral link copied! Share with your friends. 📢");
                    }}
                    className="rounded-xl bg-[#20212b] border border-border/30 text-foreground text-xs font-bold h-9 px-4 flex items-center gap-1.5 hover:bg-secondary transition-all"
                  >
                    <Share2 className="h-3.5 w-3.5 text-primary" />
                    <span>Invite Friends</span>
                  </Button>
                </div>
              </div>

              {/* 4. REWARD WALLET */}
              <div className="rounded-3xl bg-[#121317] border border-border/20 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-sm text-foreground flex items-center gap-1.5 font-sans">
                    <Award className="h-4.5 w-4.5 text-primary" />
                    <span>Reward Wallet</span>
                  </h3>
                  <button 
                    onClick={() => navigate({ to: "/app/help" })}
                    className="text-[10px] font-black text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <span>How it works?</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-[#0a0b0d]/50 border border-border/10 rounded-2xl p-4 font-sans text-xs">
                  <div>
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block">Available Reward</span>
                    <span className="text-sm sm:text-base font-black text-foreground font-mono block mt-1">
                      ${vipDashboardStats?.profile?.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[8px] text-emerald-400 font-semibold block mt-0.5">Ready to withdraw</span>
                  </div>

                  <div className="border-l border-border/10 pl-3">
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block">Pending Reward</span>
                    <span className="text-sm sm:text-base font-black text-foreground font-mono block mt-1">
                      ${currentRewardAmount}
                    </span>
                    <span className="text-[8px] text-muted-foreground font-medium block mt-0.5">Updates Sunday</span>
                  </div>

                  <div className="border-l border-border/10 pl-3">
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block">Next Payout</span>
                    <span className="text-sm sm:text-base font-black text-foreground font-mono block mt-1">
                      This Sunday
                    </span>
                    <span className="text-[8px] text-muted-foreground font-medium block mt-0.5">2 Days Left</span>
                  </div>
                </div>
              </div>

              {/* 5. REWARD HISTORY */}
              <div className="rounded-3xl bg-[#121317] border border-border/20 p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-sm text-foreground flex items-center gap-1.5 font-sans">
                    <History className="h-4.5 w-4.5 text-primary" />
                    <span>Reward History</span>
                  </h3>
                  {vipRewardsHistory.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {vipRewardsHistory.length} entries
                    </span>
                  )}
                </div>

                {vipRewardsHistory.length === 0 ? (
                  <div className="py-12 bg-[#0a0b0d]/50 border border-dashed border-border/40 rounded-2xl flex flex-col items-center justify-center text-center p-6">
                    <div className="h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-3">
                      <Gift className="h-6 w-6" />
                    </div>
                    <h4 className="font-bold text-xs text-foreground">No rewards yet!</h4>
                    <p className="text-[10px] text-muted-foreground mt-1 max-w-xs mx-auto">
                      Deposit and play to unlock your first VIP reward.
                    </p>
                    <Link to="/app/wallet" className="mt-4">
                      <Button className="rounded-full bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-800 hover:to-indigo-700 text-white text-xs font-black h-8 px-4 flex items-center gap-1 shadow-sm">
                        <span>Deposit Now</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 no-scrollbar">
                    {vipRewardsHistory
                      .slice((vipHistoryPage - 1) * 5, vipHistoryPage * 5)
                      .map((row) => {
                        const dateString = new Date(row.distribution_date).toLocaleDateString(undefined, { 
                          month: "short", 
                          day: "numeric", 
                          year: "numeric" 
                        });
                        return (
                          <div 
                            key={row.id} 
                            className="p-3 bg-[#0a0b0d]/40 border border-border/10 rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 bg-secondary/80 rounded-lg flex items-center justify-center shrink-0">
                                <img 
                                  src={getVipBadgeUrl(row.vip_status)} 
                                  className="h-6 w-auto object-contain"
                                  alt=""
                                />
                              </div>
                              <div>
                                <p className="font-bold text-foreground capitalize">
                                  {row.vip_status} Reward
                                </p>
                                <p className="text-[9px] text-muted-foreground mt-0.5">
                                  Distributed {dateString}
                                </p>
                              </div>
                            </div>

                            <span className="font-mono font-black text-sm text-green-400">
                              +${Number(row.reward_amount).toFixed(2)}
                            </span>
                          </div>
                        );
                      })}

                    {/* Pagination Controls */}
                    {vipRewardsHistory.length > 5 && (
                      <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground">
                        <span>Page {vipHistoryPage} of {Math.ceil(vipRewardsHistory.length / 5)}</span>
                        <div className="flex gap-2">
                          <Button 
                            disabled={vipHistoryPage === 1}
                            onClick={() => setVipHistoryPage(p => Math.max(1, p - 1))}
                            size="sm" 
                            variant="ghost" 
                            className="h-7 text-[10px] font-bold px-2.5"
                          >
                            Prev
                          </Button>
                          <Button 
                            disabled={vipHistoryPage === Math.ceil(vipRewardsHistory.length / 5)}
                            onClick={() => setVipHistoryPage(p => Math.min(Math.ceil(vipRewardsHistory.length / 5), p + 1))}
                            size="sm" 
                            variant="ghost" 
                            className="h-7 text-[10px] font-bold px-2.5"
                          >
                            Next
                          </Button>
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

      {/* Referrals Dialog */}
      <Dialog open={referralsModalOpen} onOpenChange={setReferralsModalOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col bg-[#121317] border border-border/20 text-left select-none text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold font-sans">
              <Users className="h-5 w-5 text-primary" /> Referral History
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              View who referred you and details of players you have referred.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Referrer Details */}
            <div className="bg-[#0a0b0d]/50 border border-border/10 rounded-xl p-4 space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider font-mono">Referred By</p>
              {loadingReferrals ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" /> Loading...
                </div>
              ) : referredByProfile ? (
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs border border-primary/20 uppercase">
                    {referredByProfile.username.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      {referredByProfile.first_name ? `${referredByProfile.first_name} ${referredByProfile.last_name || ""}`.trim() : referredByProfile.username}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">@{referredByProfile.username}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-medium text-muted-foreground italic">Direct Sign Up (No Referrer)</p>
              )}
            </div>

            {/* Referred Users List */}
            <div className="space-y-3">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider font-mono">Your Referrals</p>
              {loadingReferrals ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : referralsList.length === 0 ? (
                <div className="flex h-24 flex-col items-center justify-center border border-dashed border-border/60 rounded-xl text-center p-4">
                  <Users className="h-6 w-6 opacity-30 mb-1" />
                  <p className="text-xs font-bold text-muted-foreground">No referrals yet</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Share your referral link to invite friends!</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {referralsList.map((ref) => (
                    <div key={ref.id} className="flex items-center justify-between p-3 bg-secondary/15 border border-border/40 rounded-xl hover:border-border transition-all">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 bg-secondary border border-border rounded-full flex items-center justify-center text-foreground font-bold text-xs uppercase shrink-0">
                          {ref.referredUser.username.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">
                            {ref.referredUser.first_name ? `${ref.referredUser.first_name} ${ref.referredUser.last_name || ""}`.trim() : ref.referredUser.username}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <span>@{ref.referredUser.username}</span>
                            <span>•</span>
                            <span>{new Date(ref.created_at).toLocaleDateString()}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide border ${
                          ref.status === "qualified" || ref.status === "joined"
                            ? "bg-green-500/10 text-green-500 border-green-500/20"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        }`}>
                          {ref.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
