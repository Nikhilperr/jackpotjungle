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
  Globe
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
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/15 rounded-full blur-[120px] opacity-70" />
          <div className="absolute top-1/3 right-10 w-[400px] h-[400px] bg-amber-500/10 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="text-center space-y-6 max-w-4xl mx-auto"
          >
            {/* Tag Badge */}
            <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary border border-border/80 text-xs sm:text-sm font-semibold text-primary shadow-sm">
              <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
              <span>Experience Next-Gen Gaming & Real-Time Messaging</span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1 variants={itemVariants} className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.15] text-foreground">
              Welcome to <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-primary via-purple-400 to-amber-400 bg-clip-text text-transparent">
                Jackpot Jungle
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p variants={itemVariants} className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
              Connect seamlessly with friends, experience high-speed real-time messaging, participate in competitive leaderboards, and unlock VIP rewards.
            </motion.p>

            {/* Action Call To Actions */}
            <motion.div variants={itemVariants} className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/auth"
                className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-base bg-primary text-primary-foreground hover:opacity-95 transition-all shadow-xl hover:shadow-primary/30 flex items-center justify-center gap-2 group active:scale-95"
              >
                <span>Launch Messenger App</span>
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
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Instant Messenger</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> End-to-End Encrypted</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Daily Cashback & Rewards</span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* 2. FEATURES OVERVIEW */}
      <section className="py-16 bg-card/40 border-y border-border/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Everything In One Place</h2>
            <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Built For Ultimate Communication & Entertainment</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-background border border-border/60 shadow-sm hover:border-primary/50 transition-all space-y-4 group">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <MessageCircle className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Lightning Real-Time Chat</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Send messages, voice recordings, photos, and live reactions instantly with zero delay.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-background border border-border/60 shadow-sm hover:border-primary/50 transition-all space-y-4 group">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <PhoneCall className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Voice & Video Calls</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Connect 1-on-1 with high-definition voice and crystal clear video call streaming.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-background border border-border/60 shadow-sm hover:border-primary/50 transition-all space-y-4 group">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Trophy className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Competitive Leaderboards</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Track live rankings, climb tournament ladders, and flex your achievements to the community.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-2xl bg-background border border-border/60 shadow-sm hover:border-primary/50 transition-all space-y-4 group">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Gift className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Daily Rewards & VIP</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Claim login bonuses, daily spin rewards, referral bonuses, and tier cashback perks.
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
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  <Smartphone className="h-4 w-4" /> Available On Desktop & Mobile
                </div>
                <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                  Take Jackpot Jungle Anywhere You Go
                </h2>
                <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
                  Install our high-performance native Android application or run the instant Progressive Web App straight from your mobile browser.
                </p>
                
                <div className="pt-4 flex flex-wrap gap-4">
                  <Link
                    to="/auth"
                    className="px-6 py-3.5 rounded-full font-bold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-md flex items-center gap-2"
                  >
                    <Globe className="h-4 w-4" /> Open Web App
                  </Link>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); alert("Android APK download started!"); }}
                    className="px-6 py-3.5 rounded-full font-semibold text-sm bg-secondary text-foreground hover:bg-accent border border-border/60 transition-all flex items-center gap-2"
                  >
                    <Download className="h-4 w-4 text-emerald-400" /> Download APK
                  </a>
                </div>
              </div>

              {/* Mockup Preview Card */}
              <div className="relative flex items-center justify-center">
                <div className="w-full max-w-sm rounded-3xl border-4 border-border/80 bg-background shadow-2xl overflow-hidden p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <img src="/icons/icon-256.webp" alt="App" className="h-8 w-8 rounded-lg" />
                      <span className="font-bold text-sm">Jackpot Jungle</span>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-secondary/60 text-foreground">
                      <p className="font-bold text-primary mb-0.5">Welcome to Jackpot Jungle! 🎉</p>
                      <p>Your daily rewards have been credited to your wallet balance.</p>
                    </div>
                    <div className="p-3 rounded-xl bg-primary text-primary-foreground ml-6">
                      <p>Awesome! Thanks for the instant update!</p>
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
            <div className="p-8 rounded-3xl bg-gradient-to-br from-amber-500/10 via-card to-background border border-amber-500/30 space-y-6 relative overflow-hidden shadow-xl">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Crown className="h-7 w-7" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-foreground">Exclusive VIP Club Privileges</h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                Gain access to tiered cashback incentives, personalized account managers, priority withdrawals, and special high-roller events.
              </p>
              <Link to="/vip-club" className="inline-flex items-center gap-2 font-bold text-amber-400 hover:text-amber-300 text-sm">
                Explore VIP Tiers & Benefits <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Rewards Card Preview */}
            <div className="p-8 rounded-3xl bg-gradient-to-br from-purple-500/10 via-card to-background border border-purple-500/30 space-y-6 relative overflow-hidden shadow-xl">
              <div className="h-12 w-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Zap className="h-7 w-7" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-foreground">Referral & Community Bonuses</h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                Invite friends with your unique referral code and earn lifetime commissions on their activity. The more your network grows, the more you earn!
              </p>
              <Link to="/referral" className="inline-flex items-center gap-2 font-bold text-purple-400 hover:text-purple-300 text-sm">
                Join Referral Program <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SECURE PLATFORM HIGHLIGHTS */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Security & Reliability</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-foreground">Built On World-Class Infrastructure</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-card border border-border/50 text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Lock className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-base text-foreground">Encrypted Privacy</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">Your data and chat messages are private, protected by modern database security policies.</p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border/50 text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-base text-foreground">Verified Accounts</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">Integrated email OTP and Google OAuth authentication for safe account management.</p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border/50 text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-base text-foreground">24/7 Live Support</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">Dedicated admin support team available directly inside the app to assist you anytime.</p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
