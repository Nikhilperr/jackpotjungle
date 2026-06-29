import React from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { 
  Sparkles, 
  MessageCircle, 
  PhoneCall, 
  Trophy, 
  Gift, 
  ShieldCheck, 
  Smartphone, 
  Zap, 
  Users, 
  Crown, 
  ArrowRight, 
  CheckCircle2, 
  Download,
  Lock,
  Globe,
  Coins,
  Flame,
  Dices,
  Gamepad2
} from "lucide-react";
import { PublicLayout } from "@/components/landing/PublicLayout";

export function LandingContainer() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 25 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
  };

  return (
    <PublicLayout>
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-32">
        {/* Background Animated Glow Gradients */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/20 rounded-full blur-[120px] opacity-70" />
          <div className="absolute top-1/3 right-10 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="text-center space-y-6 max-w-4xl mx-auto"
          >
            {/* Tag Badge */}
            <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary border border-amber-500/30 text-xs sm:text-sm font-bold text-amber-400 shadow-sm">
              <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
              <span>🎰 #1 Social Casino & Gaming Messenger Platform</span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1 variants={itemVariants} className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.15] text-foreground">
              Vegas Thrills & Social Gaming <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-amber-400 via-primary to-purple-400 bg-clip-text text-transparent">
                Jackpot Jungle Casino
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p variants={itemVariants} className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
              Play real social casino slots, spin mega jackpots, join multiplayer tournaments, and chat live with fellow players in our high-speed messenger!
            </motion.p>

            {/* Action Call To Actions */}
            <motion.div variants={itemVariants} className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/auth"
                className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-base bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 group active:scale-95"
              >
                <Coins className="h-5 w-5 fill-black" />
                <span>Claim Free Chips & Play Now</span>
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>

              <a
                href="#download"
                className="w-full sm:w-auto px-8 py-4 rounded-full font-semibold text-base bg-secondary text-foreground hover:bg-accent border border-border/60 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Download className="h-5 w-5 text-primary" />
                <span>Download App</span>
              </a>
            </motion.div>

            {/* Trust Badges */}
            <motion.div variants={itemVariants} className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-amber-400" /> 100% Free Daily Bonus Coins</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-amber-400" /> Progressive Jackpot Reels</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-amber-400" /> Live Community Chat</span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* 2. CASINO FEATURES OVERVIEW */}
      <section className="py-16 bg-card/40 border-y border-border/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400">Social Casino Experience</h2>
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Non-Stop Casino Action & Community Rewards</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-background border border-border/60 shadow-sm hover:border-amber-500/50 transition-all space-y-4 group">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Coins className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Mega Jackpot Slots</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Spin progressive slot reels, unlock bonus rounds, and hit big win multipliers every single day.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-background border border-border/60 shadow-sm hover:border-purple-500/50 transition-all space-y-4 group">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Dices className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Table Games & Sweeps</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Enjoy classic casino table games, multiplayer sweeps, and competitive community tournaments.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-background border border-border/60 shadow-sm hover:border-primary/50 transition-all space-y-4 group">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <MessageCircle className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Live Casino Messenger</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Share win screenshots, voice notes, and celebrate big wins live with your social gaming network.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-2xl bg-background border border-border/60 shadow-sm hover:border-emerald-500/50 transition-all space-y-4 group">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Crown className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">VIP High-Roller Club</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ascend VIP tiers from Bronze to Diamond for custom daily cashback perks and priority rewards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. MOBILE APP PREVIEW & DOWNLOAD */}
      <section id="download" className="py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-card via-background to-secondary/40 border border-border/80 p-8 sm:p-12 lg:p-16 relative overflow-hidden shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold">
                  <Smartphone className="h-4 w-4" /> Vegas Casino On The Go
                </div>
                <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                  Play Jackpot Jungle Anywhere, Anytime
                </h2>
                <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
                  Enjoy seamless casino gameplay on mobile. Install our high-performance native Android application or launch the instant Web Casino straight from your browser!
                </p>
                
                <div className="pt-4 flex flex-wrap gap-4">
                  <Link
                    to="/auth"
                    className="px-6 py-3.5 rounded-full font-bold text-sm bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-md flex items-center gap-2"
                  >
                    <Globe className="h-4 w-4" /> Open Web Casino
                  </Link>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); alert("Android APK download started!"); }}
                    className="px-6 py-3.5 rounded-full font-semibold text-sm bg-secondary text-foreground hover:bg-accent border border-border/60 transition-all flex items-center gap-2"
                  >
                    <Download className="h-4 w-4 text-emerald-400" /> Download Android APK
                  </a>
                </div>
              </div>

              {/* Mockup Preview Card */}
              <div className="relative flex items-center justify-center">
                <div className="w-full max-w-sm rounded-3xl border-4 border-amber-500/40 bg-background shadow-2xl overflow-hidden p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <img src="/icons/icon-256.webp" alt="App" className="h-8 w-8 rounded-lg" />
                      <span className="font-bold text-sm">Jackpot Jungle Casino</span>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping" />
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-foreground">
                      <p className="font-extrabold text-amber-400 mb-0.5">🎰 MEGA JACKPOT WIN! 💎</p>
                      <p>You won $2,500.00 Coins on Lucky Reels Slot!</p>
                    </div>
                    <div className="p-3 rounded-xl bg-primary text-primary-foreground ml-6">
                      <p>Sharing my big win with the community! 🎉</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. VIP & REWARDS PREVIEW */}
      <section className="py-16 bg-card/30 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            {/* VIP Card Preview */}
            <div className="p-8 rounded-3xl bg-gradient-to-br from-amber-500/15 via-card to-background border border-amber-500/30 space-y-6 relative overflow-hidden shadow-xl">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Crown className="h-7 w-7" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-foreground">High-Roller VIP Lounge</h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                Enjoy exclusive casino perks including up to 8% daily cashback, express withdrawals, personal VIP account hosts, and private tournament tables.
              </p>
              <Link to="/vip-club" className="inline-flex items-center gap-2 font-bold text-amber-400 hover:text-amber-300 text-sm">
                Explore VIP Club Tiers <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Rewards Card Preview */}
            <div className="p-8 rounded-3xl bg-gradient-to-br from-purple-500/15 via-card to-background border border-purple-500/30 space-y-6 relative overflow-hidden shadow-xl">
              <div className="h-12 w-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Gift className="h-7 w-7" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-foreground">Free Daily Spins & Sweeps</h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                Spin the Lucky Bonus Wheel every 24 hours for instant free coins. Invite friends and earn 10% lifetime referral rewards on all active gameplay.
              </p>
              <Link to="/rewards" className="inline-flex items-center gap-2 font-bold text-purple-400 hover:text-purple-300 text-sm">
                Claim Daily Rewards <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SECURE PLATFORM HIGHLIGHTS */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400">Fair Play & Safety</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-foreground">Trusted Social Gaming Platform</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-card border border-border/50 text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Lock className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-base text-foreground">Secure Encryption</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">Your wallet balance and messenger communications are protected with enterprise security.</p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border/50 text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-base text-foreground">Verified Randomness</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">All slot spin wheels and sweepstakes results use certified random number generators for fair play.</p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border/50 text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-base text-foreground">24/7 VIP Support</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">Dedicated admin hosts are available 24/7 inside live app chat to assist with any queries.</p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
