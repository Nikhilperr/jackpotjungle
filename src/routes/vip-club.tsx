import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Crown, Check, Shield, Star, Award, Zap } from "lucide-react";

export const Route = createFileRoute("/vip-club")({
  head: () => ({ meta: [{ title: "VIP Club — Jackpot Jungle" }] }),
  component: VIPPage,
});

function VIPPage() {
  const tiers = [
    {
      name: "Bronze",
      color: "from-amber-700 to-amber-500",
      req: "Free for All Users",
      perks: ["1% Daily Cashback", "Standard Weekly Bonuses", "Community Access"],
    },
    {
      name: "Silver",
      color: "from-slate-400 to-slate-200 text-slate-900",
      req: "$500 Wallet Balance",
      perks: ["2% Daily Cashback", "2x Weekly Streaks", "Dedicated support agent"],
    },
    {
      name: "Gold",
      color: "from-yellow-600 to-yellow-400 text-yellow-950",
      req: "$2,000 Wallet Balance",
      perks: ["3.5% Daily Cashback", "3x Weekly Streaks", "Personal VIP Manager", "Exclusive Promotions"],
    },
    {
      name: "Platinum",
      color: "from-cyan-500 to-blue-400 text-blue-950",
      req: "$10,000 Wallet Balance",
      perks: ["5% Daily Cashback", "4x Weekly Streaks", "Express Withdrawals", "Special Birthday Gift"],
    },
    {
      name: "Diamond",
      color: "from-purple-600 via-pink-500 to-amber-400 text-white",
      req: "By Invite Only",
      perks: ["8% Daily Cashback", "5x Weekly Streaks", "Direct Line to VIP Host", "Luxury Vacation Invites"],
    },
  ];

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-amber-500/10 text-amber-400 items-center justify-center border border-amber-500/20 shadow-md">
            <Crown className="h-7 w-7" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Jackpot Jungle VIP Club
          </h1>
          <p className="text-muted-foreground text-lg">
            Unlock exclusive tier benefits, instant cashback, personalized host services, and direct event invitations.
          </p>
        </div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {tiers.map((tier, idx) => (
            <div 
              key={tier.name}
              className="p-6 rounded-2xl bg-card border border-border/60 flex flex-col justify-between hover:border-primary/50 transition-all hover:-translate-y-1 duration-300 shadow-md"
            >
              <div className="space-y-4">
                <div className={`p-4 rounded-xl bg-gradient-to-r ${tier.color} text-center font-black text-lg shadow-sm`}>
                  {tier.name}
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Requirement</p>
                  <p className="font-bold text-sm text-foreground">{tier.req}</p>
                </div>
                <ul className="space-y-2 pt-2">
                  {tier.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-xs">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-6">
                <Link
                  to="/auth"
                  className="w-full py-2.5 rounded-xl font-bold text-xs bg-secondary text-foreground hover:bg-accent border border-border/60 transition-colors flex items-center justify-center gap-1.5"
                >
                  Join VIP
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Perks Highlights */}
        <div className="bg-secondary/20 border border-border/40 rounded-3xl p-8 sm:p-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <Shield className="h-8 w-8 text-primary" />
            <h4 className="font-bold text-lg text-foreground">Highest Security & Trust</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your VIP status is fully protected with multi-factor authentication and private encryption layers.
            </p>
          </div>
          <div className="space-y-3">
            <Zap className="h-8 w-8 text-purple-400" />
            <h4 className="font-bold text-lg text-foreground">Instant Processing</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              VIP members benefit from accelerated verification queues and premium customer care responsiveness.
            </p>
          </div>
          <div className="space-y-3">
            <Award className="h-8 w-8 text-amber-400" />
            <h4 className="font-bold text-lg text-foreground">Premium Promotions</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Receive special high-roller invitations and custom milestone promotions tailored to your tier status.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
