import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Zap, Timer, ArrowRight, ShieldCheck, Calendar, Info, X } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/promotions")({
  head: () => ({
    meta: [
      { title: "Special Promotions & Bonus Codes — Jackpot Jungle" },
      { name: "description", content: "Claim your new member welcome code WELCOME5, participate in referrals boost campaigns, and check upcoming social sweeps tournaments." },
      { property: "og:title", content: "Special Promotions & Bonus Codes — Jackpot Jungle" },
      { property: "og:description", content: "Claim welcome chips, view upcoming promotions, and find promo coupon codes at Jackpot Jungle." },
      { property: "og:url", content: "https://playjackpotjungle.com/promotions" },
      { name: "twitter:title", content: "Special Promotions & Bonus Codes — Jackpot Jungle" },
      { name: "twitter:description", content: "Find active coupon vouchers, sweeps codes, and signup multipliers at Jackpot Jungle." },
    ],
  }),
  component: PromotionsPage,
});

interface PromoItem {
  title: string;
  badge: "Active" | "Limited Time" | "Upcoming" | "VIP Exclusive";
  desc: string;
  code: string;
  expiry: string;
  terms: string;
}

function PromotionsPage() {
  const [selectedPromo, setSelectedPromo] = useState<PromoItem | null>(null);
  const [timeLeft, setTimeLeft] = useState(86400 * 2.5); // 2.5 days in seconds

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCountdown = (totalSeconds: number) => {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  const activePromos: PromoItem[] = [
    {
      title: "New Member Welcome Bonus",
      badge: "Active",
      desc: "Sign up and complete your onboarding profile verification to receive an instant $5.00 wallet credit bonus.",
      code: "WELCOME5",
      expiry: "Ongoing",
      terms: "Valid for new accounts only. Profile must be fully onboarded (first name, last name, and username verified). Limit 1 claim per player.",
    },
    {
      title: "Referral Network Boost",
      badge: "Limited Time",
      desc: "For every friend who verifies their email, both of you get an elevated $2.00 reward credit.",
      code: "JUNGLEBOOST",
      expiry: "Limited",
      terms: "Active until the promotional period ends. Referral must complete onboarding to unlock the $2.00 deposit credit.",
    },
    {
      title: "Daily VIP Cashback Special",
      badge: "VIP Exclusive",
      desc: "Claim an elevated cashback percentage up to 8% based on your VIP status tier rankings.",
      code: "VIPCASH",
      expiry: "Ongoing",
      terms: "Cashback percentage is determined by active VIP tier (Bronze, Silver, Gold, Platinum, Diamond). Credited daily at 00:00 UTC.",
    },
  ];

  const upcomingPromos: PromoItem[] = [
    {
      title: "Summer Slots Sweeps Tournament",
      badge: "Upcoming",
      desc: "Get ready to compete in our biggest slots sweeps tournament. High prize pools and leaderboards active.",
      code: "SUMMERSWEETS",
      expiry: "Starts July 15, 2026",
      terms: "Requires level 5 or above. Spin values contribute to the tournament leaderboard metrics. Top 50 players win rewards.",
    },
    {
      title: "Crypto Deposit Match Bonus",
      badge: "Upcoming",
      desc: "Get a 20% match on your wallet coin conversions using approved crypto assets.",
      code: "CRYPTOMATCH",
      expiry: "Starts August 1, 2026",
      terms: "Match applies to conversions up to $500. Processing is instant. Match bonus is subject to standard wagering multipliers.",
    },
  ];

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* Promotional Hero Banner */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-purple-900 via-indigo-900 to-primary/80 border border-border p-8 sm:p-12 text-center text-white space-y-6 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.05),transparent)] pointer-events-none" />
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-black text-xs font-black uppercase tracking-wider animate-pulse">
            <Timer className="h-3.5 w-3.5" /> Countdown Tournament Timer
          </span>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight max-w-2xl mx-auto">
            Jungle Slots Sweeps Starts Soon!
          </h2>
          <p className="text-sm sm:text-base text-purple-100 max-w-xl mx-auto leading-relaxed">
            Get your account verified now to prepare. Summer Tournament qualifiers begin shortly.
          </p>
          <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono tracking-widest bg-black/40 py-2.5 px-6 rounded-2xl inline-block shadow-inner">
            {formatCountdown(timeLeft)}
          </div>
        </div>

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-amber-500/10 text-amber-400 items-center justify-center border border-amber-500/20 shadow-md">
            <Zap className="h-7 w-7 animate-bounce" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Active Promotions
          </h1>
          <p className="text-muted-foreground text-lg">
            Boost your balance with our limited-time special codes, welcome incentives, and VIP exclusive campaigns.
          </p>
        </div>

        {/* Active Promos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {activePromos.map((p) => (
            <div 
              key={p.title}
              className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/50 transition-all flex flex-col justify-between shadow-md"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    p.badge === "Active" ? "bg-emerald-500/10 text-emerald-400" :
                    p.badge === "Limited Time" ? "bg-amber-500/10 text-amber-400" : "bg-purple-500/10 text-purple-400"
                  }`}>
                    {p.badge}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3 w-3" /> {p.expiry}
                  </span>
                </div>
                <h3 className="font-extrabold text-xl text-foreground leading-snug">{p.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {p.desc}
                </p>
                <div className="pt-2">
                  <div className="p-3 rounded-xl bg-secondary/60 border border-border/40 text-center">
                    <span className="text-[10px] text-muted-foreground block uppercase font-bold tracking-widest mb-1">Promo Code</span>
                    <span className="font-mono text-base font-black text-primary tracking-wide">{p.code}</span>
                  </div>
                </div>
              </div>
              <div className="pt-6 flex gap-2">
                <button
                  onClick={() => setSelectedPromo(p)}
                  className="px-3 rounded-xl bg-secondary text-foreground hover:bg-accent border border-border/50 transition-colors flex items-center justify-center"
                  title="View Terms"
                >
                  <Info className="h-4 w-4 text-muted-foreground" />
                </button>
                <Link
                  to="/app/auth"
                  className="flex-1 py-3 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-primary/10"
                >
                  <span>Apply Code</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Upcoming Section */}
        <div className="space-y-8">
          <h2 className="text-2xl font-bold text-foreground text-center flex items-center justify-center gap-2">
            <Calendar className="h-6 w-6 text-purple-400 animate-pulse" />
            <span>Upcoming Campaigns</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {upcomingPromos.map((p) => (
              <div 
                key={p.title}
                className="p-6 rounded-3xl bg-secondary/10 border border-border/40 hover:border-purple-500/30 transition-all flex flex-col justify-between shadow-inner"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400">
                      {p.badge}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.expiry}</span>
                  </div>
                  <h3 className="font-extrabold text-lg text-foreground">{p.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {p.desc}
                  </p>
                </div>
                <div className="pt-6 flex gap-2">
                  <button
                    onClick={() => setSelectedPromo(p)}
                    className="w-full py-2.5 rounded-xl font-bold text-xs bg-secondary text-foreground hover:bg-accent border border-border/60 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>View Guidelines</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Details Dialog Modal */}
        <AnimatePresence>
          {selectedPromo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedPromo(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl p-6 z-10 text-left"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-extrabold text-lg text-foreground leading-tight">{selectedPromo.title} Terms</h3>
                  <button
                    onClick={() => setSelectedPromo(null)}
                    className="h-8 w-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-4 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  <p><strong>Code:</strong> <code className="font-mono text-primary font-bold bg-secondary/80 px-2 py-0.5 rounded">{selectedPromo.code}</code></p>
                  <p><strong>Expiry:</strong> {selectedPromo.expiry}</p>
                  <p className="border-t border-border/40 pt-3">
                    <strong>Rules & Details:</strong><br />
                    {selectedPromo.terms}
                  </p>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Security / Verification */}
        <div className="bg-secondary/20 border border-border/40 rounded-3xl p-8 sm:p-12 text-center space-y-4 max-w-4xl mx-auto">
          <div className="h-10 w-10 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-extrabold text-foreground">Verified Promotion Verification</h3>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
            All bonus codes are checked by our database validator. Users are limited to one welcome code per verified account to prevent duplicate claiming.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
