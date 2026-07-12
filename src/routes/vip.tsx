import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Crown, Check, ShieldCheck, Award, Zap, Gem, Landmark, Coins } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/vip")({
  head: () => ({
    meta: [
      { title: "VIP Club — Jackpot Jungle Messenger & Casino" },
      { name: "description", content: "Join the exclusive Jackpot Jungle VIP Club. Deposit $100 to get Bronze with $15 reward, up to Diamond with $100 reward. Unlock daily cashbacks up to 25%." },
      { property: "og:title", content: "VIP Club — Jackpot Jungle Messenger & Casino" },
      { property: "og:description", content: "Join the VIP Club at Jackpot Jungle. Deposit to rank up from Bronze to Diamond and unlock massive welcome rewards and cashbacks." },
      { property: "og:url", content: "https://playjackpotjungle.com/vip" },
      { name: "twitter:title", content: "VIP Club — Jackpot Jungle Messenger & Casino" },
      { name: "twitter:description", content: "Learn about the Jackpot Jungle VIP Program tiers, requirements, welcome bonuses, and cashback rates." },
    ],
  }),
  component: VIPPage,
});

function VIPPage() {
  const tiers = [
    {
      name: "Bronze Medallion",
      img: "/bronze.png",
      deposit: "$100",
      reward: "$15",
      cashback: "5%",
      color: "from-amber-700 to-amber-900 border-amber-700/50 shadow-amber-500/5",
      perks: [
        "5% Daily Cashback Rate",
        "Instant $15 Welcome Reward",
        "Weekly Match Boosters",
        "Standard Chat Room Access",
      ],
    },
    {
      name: "Silver Medallion",
      img: "/silver.png",
      deposit: "$250",
      reward: "$10",
      cashback: "8%",
      color: "from-slate-400 to-slate-600 border-slate-400/50 shadow-slate-500/5",
      perks: [
        "8% Daily Cashback Rate",
        "Instant $10 Welcome Reward",
        "Priority Customer Support Queue",
        "Exclusive Medallion Icon",
      ],
    },
    {
      name: "Gold Medallion",
      img: "/gold.png",
      deposit: "$500",
      reward: "$40",
      cashback: "12%",
      color: "from-yellow-500 to-amber-500 border-yellow-500/50 shadow-yellow-500/5",
      perks: [
        "12% Daily Cashback Rate",
        "Instant $40 Welcome Reward",
        "Personal VIP Account Manager",
        "3x Weekly Level-up Streaks",
      ],
    },
    {
      name: "Platinum Medallion",
      img: "/platium.png",
      deposit: "$1,000",
      reward: "$75",
      cashback: "18%",
      color: "from-cyan-400 to-blue-500 border-cyan-400/50 shadow-cyan-500/5",
      perks: [
        "18% Daily Cashback Rate",
        "Instant $75 Welcome Reward",
        "Express Withdrawal Approvals",
        "Milestone Birthday Perks",
      ],
    },
    {
      name: "Diamond Medallion",
      img: "/dimond.png",
      deposit: "$5,000",
      reward: "$100",
      cashback: "25%",
      color: "from-purple-500 to-indigo-600 border-purple-500/50 shadow-purple-500/5",
      perks: [
        "25% Daily Cashback Rate",
        "Instant $100 Welcome Reward",
        "Direct Line to Elite VIP Host",
        "Luxury Offline Event Invites",
      ],
    },
  ];

  return (
    <PublicLayout>
      <div className="relative min-h-screen bg-background text-foreground overflow-hidden py-16 sm:py-24">
        {/* Background Gradients */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[140px]" />
          <div className="absolute top-2/3 left-1/4 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-16">
          
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 100 }}
              className="inline-flex h-16 w-16 rounded-3xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black items-center justify-center border border-amber-300/30 shadow-lg shadow-amber-500/25"
            >
              <Crown className="h-8 w-8 animate-pulse" />
            </motion.div>
            
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-4xl sm:text-6xl font-black tracking-tight text-foreground leading-none"
            >
              Jungle VIP Club
            </motion.h1>
            
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto font-medium"
            >
              Unlock legendary privileges. Progress from Bronze to Diamond by depositing and claim instant rewards, custom hosts, and cashbacks.
            </motion.p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {tiers.map((tier, idx) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 50, delay: idx * 0.1 }}
                className={`p-6 rounded-3xl bg-gradient-to-br from-card to-background border-2 shadow-2xl flex flex-col justify-between items-center text-center gap-6 hover:scale-[1.02] transition-transform duration-300 relative overflow-hidden group ${tier.color}`}
              >
                {/* Ribbon decoration */}
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-12 h-12 bg-white/5 rounded-full blur-lg pointer-events-none" />

                {/* Level Tag Header */}
                <div className="space-y-1">
                  <h3 className="font-black text-lg text-foreground tracking-tight">
                    {tier.name.split(" ")[0]}
                  </h3>
                  <span className="text-[10px] tracking-widest font-black uppercase text-muted-foreground/80 font-mono">
                    Tier {idx + 1}
                  </span>
                </div>

                {/* Medallion Medals Icon */}
                <div className="h-28 w-28 flex items-center justify-center select-none pointer-events-none drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)] group-hover:scale-110 transition-transform duration-300">
                  <img 
                    src={tier.img} 
                    alt={tier.name} 
                    className="max-h-24 w-auto object-contain animate-pulse"
                    style={{ animationDuration: `${4 + idx}s` }}
                  />
                </div>

                {/* Requirements / Rewards Info */}
                <div className="w-full bg-black/45 p-3 rounded-xl border border-border/10 space-y-1 font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Deposit:</span>
                    <span className="font-extrabold text-foreground">{tier.deposit}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-border/10 pt-1.5 mt-1">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Reward:</span>
                    <span className="font-extrabold text-green-400">{tier.reward} Free</span>
                  </div>
                </div>

                {/* Perks Checklist */}
                <ul className="w-full space-y-2 text-left pt-2 border-t border-border/20 flex-1">
                  <li className="flex justify-between items-center text-xs pb-1.5 border-b border-border/10">
                    <span className="text-muted-foreground font-semibold">Daily Cashback:</span>
                    <span className="font-black text-amber-400">{tier.cashback}</span>
                  </li>
                  {tier.perks.slice(1).map((perk) => (
                    <li key={perk} className="flex items-start gap-1.5 text-[11px] leading-tight">
                      <Check className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{perk}</span>
                    </li>
                  ))}
                </ul>

                {/* Join CTA */}
                <div className="w-full pt-4">
                  <Link
                    to="/app/auth"
                    className="w-full h-10 rounded-xl font-bold text-xs bg-secondary text-foreground hover:bg-accent border border-border/50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Coins className="h-3.5 w-3.5 text-primary" />
                    <span>Claim Reward</span>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Perks Highlights Grid */}
          <div className="bg-gradient-to-br from-card to-background border border-border/60 rounded-3xl p-8 sm:p-12 grid grid-cols-1 md:grid-cols-3 gap-8 shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-purple-500 to-cyan-500 rounded-t-3xl" />
            
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Landmark className="h-5 w-5" />
              </div>
              <h4 className="font-extrabold text-lg text-foreground">Secure Vault Safeguard</h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                VIP player records and wallets are fully protected by multi-factor security layers and strict Supabase database policies.
              </p>
            </div>
            
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Zap className="h-5 w-5" />
              </div>
              <h4 className="font-extrabold text-lg text-foreground">Accelerated Approvals</h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Unlock lightning-fast redemption and priority handling for all verification and withdrawal requests.
              </p>
            </div>
            
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Crown className="h-5 w-5 animate-pulse" />
              </div>
              <h4 className="font-extrabold text-lg text-foreground">Elite Custom Promotions</h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Receive match bonus sheets, secret promo codes, and special invites tailored strictly to your rank progress.
              </p>
            </div>
          </div>

        </div>
      </div>
    </PublicLayout>
  );
}
