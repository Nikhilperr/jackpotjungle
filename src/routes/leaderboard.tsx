import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Trophy, Medal, Crown, Flame, ArrowRight, Award, Shield } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Live Casino Leaderboard Rankings — Jackpot Jungle" },
      { name: "description", content: "Check the official Jackpot Jungle leaderboard. Compare rankings for top casino winners, top network referrers, weekly streaks, and VIP standings." },
      { property: "og:title", content: "Live Casino Leaderboard Rankings — Jackpot Jungle" },
      { property: "og:description", content: "Compare player stats, weekly sweeps standings, and referral counts at Jackpot Jungle." },
      { property: "og:url", content: "https://playjackpotjungle.com/leaderboard" },
      { name: "twitter:title", content: "Live Casino Leaderboard Rankings — Jackpot Jungle" },
      { name: "twitter:description", content: "Check the top player standings and weekly tournament winners at Jackpot Jungle." },
    ],
  }),
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
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-amber-500/10 text-amber-400 items-center justify-center border border-amber-500/20 shadow-md">
            <Trophy className="h-7 w-7" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Community Leaderboard
          </h1>
          <p className="text-muted-foreground text-lg">
            See who is leading the ranks in total earnings, daily streaks, and tournament activity across Jackpot Jungle.
          </p>
        </div>

        {/* Categories Tab Selector */}
        <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto">
          {categories.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border ${
                  active 
                    ? "bg-primary border-transparent text-primary-foreground shadow-md shadow-primary/10" 
                    : "bg-card border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Leaderboard Table Card */}
        <div className="max-w-4xl mx-auto bg-card border border-border/60 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 bg-gradient-to-r from-card to-secondary/40 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-500" />
              <h3 className="font-extrabold text-base sm:text-lg text-foreground">
                {categories.find((c) => c.id === activeCategory)?.label} Standings
              </h3>
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {categories.find((c) => c.id === activeCategory)?.sub}
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="divide-y divide-border/40"
            >
              {rankingsData[activeCategory].map((user) => (
                <div key={user.rank} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-black text-sm ${
                      user.rank === 1 ? "bg-amber-500 text-black" :
                      user.rank === 2 ? "bg-slate-300 text-black" :
                      user.rank === 3 ? "bg-amber-700 text-white" : "bg-secondary text-muted-foreground"
                    }`}>
                      {user.rank}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{user.avatar}</span>
                      <div>
                        <p className="font-bold text-sm text-foreground">{user.name}</p>
                        <span className="text-[10px] text-primary font-semibold uppercase tracking-wider">{user.badge}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-base text-foreground block">{user.score}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest text-[9px]">
                      {activeCategory === "referrers" ? "Verified signups" : activeCategory === "vip" ? "Status" : "Total Won"}
                    </span>
                  </div>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>

          <div className="p-6 bg-secondary/30 text-center border-t border-border/40 space-y-3">
            <p className="text-xs text-muted-foreground">Want your name on top of the global leaderboard?</p>
            <Link
              to="/app/auth"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-md animate-pulse"
            >
              <span>Start Playing Now</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
