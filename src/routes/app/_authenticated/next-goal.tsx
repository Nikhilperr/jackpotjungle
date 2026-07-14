import { createFileRoute } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Target, Crown, Sparkles, Loader2, CheckCircle2, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/_authenticated/next-goal")({
  ssr: false,
  head: () => ({ meta: [{ title: "VIP Next Goal — JJ Messenger" }] }),
  component: NextGoalPage,
});

const VIP_LEVELS = [
  { name: "Bronze", target: 100, reward: "$10.00 Bonus" },
  { name: "Silver", target: 250, reward: "$25.00 Bonus" },
  { name: "Gold", target: 500, reward: "$50.00 Bonus" },
  { name: "Platinum", target: 1000, reward: "$100.00 Bonus & Priority support" },
  { name: "Diamond", target: 5000, reward: "$500.00 Bonus & Account Host" },
  { name: "Black Diamond", target: 10000, reward: "$1,500.00 Cash Bonus & Ultimate VIP Lounge" },
];

function NextGoalPage() {
  const { user } = useAuth();
  const [totalCashin, setTotalCashin] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const fetchCashins = async () => {
      try {
        const { data, error } = await supabase
          .from("wallet_transactions")
          .select("amount")
          .eq("user_id", user.id)
          .eq("action", "cashin");

        if (error) throw error;

        const sum = data?.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) || 0;
        if (mounted) {
          setTotalCashin(sum);
        }
      } catch (err) {
        console.error("Failed to load transactions for next goal:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchCashins();
    return () => {
      mounted = false;
    };
  }, [user]);

  if (loading || totalCashin === null) {
    return (
      <AppShell>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  // Find next VIP level
  const currentTotal = totalCashin;
  const nextLevelIndex = VIP_LEVELS.findIndex((lvl) => currentTotal < lvl.target);
  const isMaxedOut = nextLevelIndex === -1;

  const currentLevel = isMaxedOut 
    ? VIP_LEVELS[VIP_LEVELS.length - 1] 
    : nextLevelIndex === 0 
      ? { name: "None", target: 0, reward: "" } 
      : VIP_LEVELS[nextLevelIndex - 1];

  const nextLevel = isMaxedOut ? null : VIP_LEVELS[nextLevelIndex];

  // Calculate percentage progress to next tier
  let progressPercent = 100;
  let remainingAmount = 0;
  
  if (nextLevel) {
    const prevTarget = currentLevel.target;
    const currentProgress = currentTotal - prevTarget;
    const neededForNext = nextLevel.target - prevTarget;
    progressPercent = Math.min(100, Math.max(0, (currentProgress / neededForNext) * 100));
    remainingAmount = Math.max(0, nextLevel.target - currentTotal);
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <span>Next Goal</span>
          </h1>
        </div>

        {/* Page Body */}
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          
          {/* Main Status Showcase */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Total Deposit Stats Card */}
            <div className="md:col-span-5 rounded-3xl bg-card border border-border/60 p-6 flex flex-col justify-between shadow-sm relative overflow-hidden text-left select-none">
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider block">
                  Total VIP Cash-Ins
                </span>
                <h2 className="text-3xl sm:text-4xl font-black text-foreground font-mono">
                  ${currentTotal.toFixed(2)}
                </h2>
              </div>
              <div className="mt-8 space-y-1.5 border-t border-border/40 pt-4">
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                  <Crown className="h-4 w-4 text-amber-500" />
                  <span>Current Tier: <strong className="text-foreground">{currentLevel.name}</strong></span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  All automated crypto deposits & manual ledger cash-ins count towards your VIP progression level.
                </p>
              </div>
            </div>

            {/* Next Level Progress Card */}
            <div className="md:col-span-7 rounded-3xl bg-gradient-to-br from-primary/10 via-purple-600/5 to-amber-500/5 border border-border/80 p-6 flex flex-col justify-between shadow-lg relative overflow-hidden select-none">
              {isMaxedOut ? (
                // Maxed Out Layout
                <div className="space-y-4 text-center my-auto">
                  <div className="inline-flex h-12 w-12 rounded-full bg-amber-500/20 text-amber-500 items-center justify-center border border-amber-500/30 shadow-md">
                    <Crown className="h-6 w-6 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-black tracking-tight text-foreground uppercase tracking-wider flex items-center justify-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary animate-bounce" />
                      MAXED OUT
                      <Sparkles className="h-4 w-4 text-primary animate-bounce" />
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                      You have reached the ultimate level: <strong className="text-amber-500">Black Diamond VIP</strong>! You are enjoying maximum cashbacks, private account hosts, and absolute priority rewards.
                    </p>
                  </div>
                </div>
              ) : (
                // Progress Bar layout
                <div className="space-y-4 flex-1 flex flex-col justify-between text-left">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="h-3 w-3 animate-spin-slow" />
                        Next VIP Level: {nextLevel?.name}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground font-mono">
                        {progressPercent.toFixed(0)}%
                      </span>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="w-full h-3 bg-secondary rounded-full overflow-hidden border border-border/40 p-0.5 shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      You need <strong className="text-foreground font-mono">${remainingAmount.toFixed(2)}</strong> more in deposits to reach <strong className="text-foreground">{nextLevel?.name}</strong> level and unlock:
                    </p>
                    <div className="bg-secondary/40 border border-border/40 rounded-2xl p-3.5 text-xs text-foreground font-bold flex items-center gap-2">
                      <Gift className="h-4.5 w-4.5 text-primary shrink-0" />
                      <span>{nextLevel?.reward}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* All VIP Tiers Listing */}
          <div className="bg-card border border-border/60 rounded-3xl p-5 shadow-sm space-y-4 text-left">
            <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
              <Crown className="h-4.5 w-4.5 text-primary" />
              Social Casino VIP Milestones
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {VIP_LEVELS.map((lvl) => {
                const unlocked = currentTotal >= lvl.target;
                const active = !unlocked && currentTotal < lvl.target && (VIP_LEVELS.findIndex(x => x.target === lvl.target) === nextLevelIndex);
                
                return (
                  <div 
                    key={lvl.name}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                      unlocked 
                        ? "bg-green-500/5 border-green-500/20" 
                        : active 
                          ? "bg-primary/5 border-primary/45 shadow-sm"
                          : "bg-secondary/25 border-border/40 opacity-70"
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm text-foreground">{lvl.name}</span>
                        {unlocked ? (
                          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[9px] font-black uppercase tracking-wider">
                            Unlocked
                          </span>
                        ) : active ? (
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider animate-pulse">
                            In Progress
                          </span>
                        ) : (
                          <Lock className="h-3 w-3 text-muted-foreground opacity-60" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-semibold font-mono">
                        Target Deposit: ${lvl.target}
                      </p>
                    </div>
                    <div className="border-t border-border/30 pt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Gift className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="truncate">{lvl.reward}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
