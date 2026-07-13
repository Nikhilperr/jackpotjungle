import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Trophy, Flame, Trophy as TrophyIcon, Sparkles, Shield, User, Award, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/app/_authenticated/leaderboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Leaderboard — JJ Messenger" }] }),
  component: LeaderboardPage,
});

type Category = "winners" | "referrers" | "weekly" | "monthly" | "vip";

function LeaderboardPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("winners");

  const categories: Array<{ id: Category; label: string; sub: string }> = [
    { id: "winners", label: "Top Winners", sub: "All-Time Credits Won" },
    { id: "weekly", label: "Weekly Rankings", sub: "Weekly Sweeps Standings" },
    { id: "monthly", label: "Monthly Rankings", sub: "Current Month Standings" },
    { id: "referrers", label: "Top Referrers", sub: "Total Verified Signups" },
    { id: "vip", label: "VIP Standings", sub: "VIP Level Order" },
  ];

  // Mock data to render behind the glass blur overlay
  const rankingsData: Record<Category, Array<{ rank: number; name: string; score: string; badge: string; avatar: string }>> = {
    winners: [
      { rank: 1, name: "Alexander_V", score: "$14,250.00", badge: "Diamond VIP", avatar: "👑" },
      { rank: 2, name: "Samantha_Pro", score: "$11,800.00", badge: "Platinum VIP", avatar: "🥇" },
      { rank: 3, name: "CryptoKing99", score: "$9,450.00", badge: "Gold VIP", avatar: "🥈" },
      { rank: 4, name: "LuckyStriker", score: "$7,200.00", badge: "Gold VIP", avatar: "🥉" },
      { rank: 5, name: "JungleMaster", score: "$5,900.00", badge: "Silver VIP", avatar: "⚡" },
    ],
    weekly: [
      { rank: 1, name: "Samantha_Pro", score: "$2,850.00", badge: "Platinum VIP", avatar: "🥇" },
      { rank: 2, name: "JungleMaster", score: "$1,920.00", badge: "Silver VIP", avatar: "🥈" },
      { rank: 3, name: "Alexander_V", score: "$1,400.00", badge: "Diamond VIP", avatar: "🥉" },
      { rank: 4, name: "VegasVibe", score: "$980.00", badge: "Bronze VIP", avatar: "⚡" },
      { rank: 5, name: "SpinWheelX", score: "$750.00", badge: "Bronze VIP", avatar: "✨" },
    ],
    monthly: [
      { rank: 1, name: "Alexander_V", score: "$8,900.00", badge: "Diamond VIP", avatar: "👑" },
      { rank: 2, name: "Samantha_Pro", score: "$7,420.00", badge: "Platinum VIP", avatar: "🥇" },
      { rank: 3, name: "LuckyStriker", score: "$5,100.00", badge: "Gold VIP", avatar: "🥈" },
      { rank: 4, name: "CryptoKing99", score: "$4,850.00", badge: "Gold VIP", avatar: "🥉" },
      { rank: 5, name: "JungleMaster", score: "$3,600.00", badge: "Silver VIP", avatar: "⚡" },
    ],
    referrers: [
      { rank: 1, name: "SocialPromo_X", score: "412 Invites", badge: "Platinum VIP", avatar: "🥇" },
      { rank: 2, name: "JunglePartner", score: "298 Invites", badge: "Gold VIP", avatar: "🥈" },
      { rank: 3, name: "CoinMaster", score: "187 Invites", badge: "Silver VIP", avatar: "🥉" },
      { rank: 4, name: "ReferralGuy", score: "115 Invites", badge: "Bronze VIP", avatar: "⚡" },
      { rank: 5, name: "VegasFan", score: "89 Invites", badge: "Bronze VIP", avatar: "✨" },
    ],
    vip: [
      { rank: 1, name: "Alexander_V", score: "Diamond Tier", badge: "VIP Level 50", avatar: "👑" },
      { rank: 2, name: "Samantha_Pro", score: "Platinum Tier", badge: "VIP Level 42", avatar: "🥇" },
      { rank: 3, name: "HighRoller_88", score: "Platinum Tier", badge: "VIP Level 38", avatar: "🥈" },
      { rank: 4, name: "CryptoKing99", score: "Gold Tier", badge: "VIP Level 29", avatar: "🥉" },
      { rank: 5, name: "LuckyStriker", score: "Gold Tier", badge: "VIP Level 25", avatar: "⚡" },
    ],
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold">Leaderboard</h1>
        </div>

        {/* Page Body */}
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300 relative">
          
          {/* Header Description */}
          <div className="text-center space-y-2 select-none pt-4 max-w-2xl mx-auto">
            <div className="inline-flex h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 items-center justify-center border border-amber-500/20 shadow-md">
              <Trophy className="h-6 w-6" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Jungle Rankings Standings
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Track top active players, winners, referral leaders, and VIP milestones in the global Jackpot Jungle community.
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex flex-wrap justify-center gap-2 select-none">
            {categories.map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all border ${
                    active
                      ? "bg-primary border-transparent text-primary-foreground shadow-md"
                      : "bg-card border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Standings Grid with Blurry Overlays */}
          <div className="relative bg-card border border-border/60 rounded-3xl overflow-hidden shadow-xl min-h-[400px]">
            
            {/* Header detail */}
            <div className="p-4 sm:p-5 bg-secondary/15 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-4.5 w-4.5 text-amber-500" />
                <h3 className="font-extrabold text-sm sm:text-base text-foreground">
                  {categories.find((c) => c.id === activeCategory)?.label} Standings
                </h3>
              </div>
              <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">
                {categories.find((c) => c.id === activeCategory)?.sub}
              </span>
            </div>

            {/* Blurred Rankings List */}
            <div className="divide-y divide-border/45 filter blur-[3px] select-none pointer-events-none opacity-40">
              {rankingsData[activeCategory].map((row) => (
                <div key={row.rank} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs bg-secondary text-muted-foreground">
                      {row.rank}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{row.avatar}</span>
                      <div className="text-left">
                        <p className="font-bold text-xs text-foreground">{row.name}</p>
                        <span className="text-[9px] text-primary font-semibold uppercase tracking-wide">{row.badge}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-sm text-foreground block">{row.score}</span>
                    <span className="text-[8px] text-muted-foreground uppercase tracking-widest">Score</span>
                  </div>
                </div>
              ))}
            </div>

            {/* High-fidelity Glassmorphism Coming Soon Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-md p-6 sm:p-8">
              <div className="bg-card/75 border border-border/80 rounded-2xl p-6 sm:p-8 text-center max-w-sm sm:max-w-md space-y-4 shadow-2xl relative overflow-hidden">
                {/* Background glow decorator */}
                <div className="absolute -top-12 -left-12 h-32 w-32 bg-primary/20 rounded-full filter blur-xl select-none" />
                <div className="absolute -bottom-12 -right-12 h-32 w-32 bg-amber-500/10 rounded-full filter blur-xl select-none" />

                <div className="relative space-y-4">
                  <div className="inline-flex h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 items-center justify-center shadow-inner animate-pulse">
                    <TrophyIcon className="h-6 w-6" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-black text-lg sm:text-xl text-foreground flex items-center justify-center gap-1.5">
                      <span>Rankings Coming Soon</span>
                      <Sparkles className="h-4.5 w-4.5 text-amber-400 shrink-0" />
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      We are currently completing data sync optimizations and ranking cycle calculations. Live leaderboards will activate in the next update.
                    </p>
                  </div>

                  <div className="border-t border-border/50 pt-3 text-[10px] text-muted-foreground font-semibold flex justify-center gap-4">
                    <span className="flex items-center gap-1">
                      <Shield className="h-3 w-3 text-primary" /> Verified Stats
                    </span>
                    <span className="flex items-center gap-1">
                      <Award className="h-3 w-3 text-primary" /> Weekly Rewards
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </AppShell>
  );
}
