import { createFileRoute } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Gift, Zap, HelpCircle, CheckCircle2, Clock, Award, Crown, Calendar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/app/_authenticated/rewards")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Rewards — JJ Messenger" }] }),
  component: RewardsPage,
});

function RewardsPage() {
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});

  const categories = [
    {
      id: "lucky-wheel",
      title: "Daily Lucky Wheel",
      desc: "Spin the wheel once every 24 hours to earn free credits up to $100 instantly.",
      val: "Up to $100.00",
      type: "Daily Spin",
      icon: Clock,
      available: true,
    },
    {
      id: "streak",
      title: "7-Day Login Streak",
      desc: "Log in daily to claim consecutive rewards. Compounding bonuses are awarded on day 7.",
      val: "Weekly Multipliers",
      type: "Weekly Streak",
      icon: Calendar,
      available: false,
    },
    {
      id: "cashback",
      title: "Monthly VIP Cashback",
      desc: "Receive compounding cashback directly deposited into your wallet based on your active play status.",
      val: "Up to 8% cashback",
      type: "Monthly VIP",
      icon: Crown,
      available: true,
    },
    {
      id: "milestones",
      title: "Milestone Achievements",
      desc: "Complete messenger tasks, join sweeps tournaments, and gain levels to claim cash coins.",
      val: "Progressive Bonuses",
      type: "Achievements",
      icon: Award,
      available: false,
    },
    {
      id: "birthday",
      title: "Birthday Celebration",
      desc: "Celebrate your special day with a customized coin voucher from the Jackpot Jungle support hosts.",
      val: "Varies by VIP Tier",
      type: "Annually",
      icon: Gift,
      available: true,
    },
  ];

  const handleClaim = (id: string, name: string) => {
    setClaiming((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setClaiming((prev) => ({ ...prev, [id]: false }));
      toast.success(`${name} claim request submitted! Our Support Team is validating your reward. 🎁`);
    }, 1200);
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2 bg-card/90 backdrop-blur-md sticky top-0 z-10">
          <HamburgerButton />
          <h1 className="font-bold flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <span>Rewards Center</span>
          </h1>
        </div>

        {/* Page Body */}
        <div className="max-w-5xl mx-auto p-4 pb-28 md:pb-6 md:p-6 space-y-6 animate-in fade-in duration-300">
          {/* Header Banner */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-purple-600/10 to-amber-500/10 border border-border/80 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden shadow-lg select-none">
            <div className="space-y-3 max-w-2xl text-left">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary border border-primary/30 tracking-widest inline-block flex items-center gap-1 w-fit">
                <Sparkles className="h-3 w-3 animate-spin-slow" />
                Community Perks
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                Claim Free Daily Spins & Bonuses
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Log in daily to claim spins, unlock achievements, or check your milestones. Claimed bonuses are processed by our hosts and sent directly to your wallet!
              </p>
            </div>
            <div className="h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner">
              <Gift className="h-10 w-10 animate-bounce" />
            </div>
          </div>

          {/* Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((reward) => {
              const Icon = reward.icon;
              const isClaiming = claiming[reward.id];
              return (
                <div 
                  key={reward.id}
                  className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/40 transition-all flex flex-col justify-between shadow-md relative overflow-hidden group"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wider">
                        {reward.type}
                      </span>
                      <span className="text-xs font-black text-amber-500 font-mono">{reward.val}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                      <h3 className="font-extrabold text-base text-foreground truncate">{reward.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed text-left min-h-[48px]">
                      {reward.desc}
                    </p>
                  </div>
                  <div className="pt-6">
                    <Button
                      onClick={() => handleClaim(reward.id, reward.title)}
                      disabled={isClaiming || !reward.available}
                      variant={reward.available ? "default" : "secondary"}
                      className="w-full rounded-xl font-bold text-xs h-11"
                    >
                      {isClaiming ? "Claiming..." : reward.available ? "Claim Reward" : "Locked / Claimed"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Guidelines */}
          <div className="bg-secondary/35 border border-border/40 rounded-3xl p-6 sm:p-8 text-left space-y-4">
            <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              How Claim Verification Works
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Once you submit a claim request, the social casino audit logs verify your criteria (such as login streaks or active VIP milestone status). Verification is finalized by support hosts, and approved balances are credited to your active wallet balance instantly.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-3.5 bg-card/60 border border-border/40 rounded-2xl space-y-1">
                <span className="text-[10px] uppercase font-black text-primary">Verification</span>
                <p className="text-xs text-muted-foreground">Automated log validation happens within minutes.</p>
              </div>
              <div className="p-3.5 bg-card/60 border border-border/40 rounded-2xl space-y-1">
                <span className="text-[10px] uppercase font-black text-primary">Limits</span>
                <p className="text-xs text-muted-foreground">Daily lucky spins are restricted to once per 24 hours.</p>
              </div>
              <div className="p-3.5 bg-card/60 border border-border/40 rounded-2xl space-y-1">
                <span className="text-[10px] uppercase font-black text-primary">Support Link</span>
                <p className="text-xs text-muted-foreground">Vouchers are delivered in direct support page chat.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
