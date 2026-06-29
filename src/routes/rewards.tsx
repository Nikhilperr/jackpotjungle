import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Gift, Zap, HelpCircle, ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/rewards")({
  head: () => ({ meta: [{ title: "Rewards — Jackpot Jungle" }] }),
  component: RewardsPage,
});

function RewardsPage() {
  const activeRewards = [
    {
      title: "Daily Lucky Wheel",
      desc: "Spin the wheel once every 24 hours to earn free credits up to $100 instantly.",
      type: "Daily Spin",
      value: "Up to $100.00",
    },
    {
      title: "7-Day Login Streak",
      desc: "Log in daily to claim consecutive rewards. Compounding bonuses are awarded on day 7.",
      type: "Login Streak",
      value: "Multipliers active",
    },
    {
      title: "Referral Commission",
      desc: "Get rewarded instantly when friends join with your code, plus 10% lifetime commissions.",
      type: "Referral",
      value: "10% Lifetime",
    },
  ];

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-primary/10 text-primary items-center justify-center border border-primary/20 shadow-md">
            <Gift className="h-7 w-7" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Jackpot Jungle Rewards
          </h1>
          <p className="text-muted-foreground text-lg">
            Earn continuous credits through spins, login streaks, and simple social sharing milestones.
          </p>
        </div>

        {/* Rewards List */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {activeRewards.map((reward) => (
            <div 
              key={reward.title}
              className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/50 transition-all flex flex-col justify-between shadow-md"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold">
                    {reward.type}
                  </span>
                  <span className="text-sm font-black text-amber-500">{reward.value}</span>
                </div>
                <h3 className="font-extrabold text-xl text-foreground">{reward.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {reward.desc}
                </p>
              </div>
              <div className="pt-6">
                <Link
                  to="/auth"
                  className="w-full py-3 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-primary/10"
                >
                  <span>Claim Now</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Highlights */}
        <div className="bg-secondary/20 border border-border/40 rounded-3xl p-8 sm:p-12 relative overflow-hidden">
          <div className="max-w-2xl space-y-4">
            <h3 className="text-2xl font-extrabold text-foreground">How Jackpot Jungle Rewards Work</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Our community rewards system is completely transparent. Accumulate wallet credits by executing standard actions like chatting with friends, inviting players, and daily logins. All reward credits can be used immediately across the Jackpot Jungle ecosystem.
            </p>
            <ul className="space-y-2 pt-2 text-xs sm:text-sm">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Instant wallet credit deposition upon claiming</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Progressive multipliers for consecutive login streaks</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Fully transparent transaction history log in the app</li>
            </ul>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
