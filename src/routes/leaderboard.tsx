import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Trophy, Medal, Crown, Flame, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — Jackpot Jungle" }] }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const mockRankings = [
    { rank: 1, name: "Alexander_V", score: "$14,250.00", badge: "Diamond VIP", avatar: "👑" },
    { rank: 2, name: "Samantha_Pro", score: "$11,800.00", badge: "Platinum VIP", avatar: "🥇" },
    { rank: 3, name: "CryptoKing99", score: "$9,450.00", badge: "Gold VIP", avatar: "🥈" },
    { rank: 4, name: "LuckyStriker", score: "$7,200.00", badge: "Gold VIP", avatar: "🥉" },
    { rank: 5, name: "JungleMaster", score: "$5,900.00", badge: "Silver VIP", avatar: "⚡" },
  ];

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
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

        {/* Leaderboard Table Card */}
        <div className="max-w-4xl mx-auto bg-card border border-border/60 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 bg-gradient-to-r from-card to-secondary/40 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-500" />
              <h3 className="font-extrabold text-lg text-foreground">Top Player Standings</h3>
            </div>
            <span className="text-xs text-muted-foreground font-medium">Updated Live</span>
          </div>

          <div className="divide-y divide-border/40">
            {mockRankings.map((user) => (
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
                  <span className="text-[10px] text-muted-foreground uppercase">Total Winnings</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 bg-secondary/30 text-center border-t border-border/40 space-y-3">
            <p className="text-xs text-muted-foreground">Want your name on top of the global leaderboard?</p>
            <Link
              to="/app/auth"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-md"
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
