import React, { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform } from "framer-motion";
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
  Dices,
  Flame
} from "lucide-react";
import { PublicLayout } from "@/components/landing/PublicLayout";

export function LandingContainer() {
  const [jackpot, setJackpot] = useState(8742510.45);

  // Animate jackpot counter like a real slot machine
  useEffect(() => {
    const interval = setInterval(() => {
      setJackpot((prev) => prev + Math.random() * 15.5);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const formatJackpot = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  // Scroll parallax effects for subtle background depth
  const { scrollY } = useScroll();
  const yBg = useTransform(scrollY, [0, 1000], [0, 150]);
  const rotateBg = useTransform(scrollY, [0, 2000], [0, 45]);

  const card3DVariants = {
    rest: { transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)", z: 0 },
    hover: { 
      transform: "perspective(1000px) rotateX(6deg) rotateY(-8deg) scale(1.03)", 
      z: 50,
      boxShadow: "0 25px 50px -12px rgba(245, 158, 11, 0.25)",
      borderColor: "rgba(245, 158, 11, 0.5)",
      transition: { duration: 0.3, ease: "easeOut" }
    }
  };

  const scrollRevealVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { 
      opacity: 1, 
      y: 0, 
      transition: { type: "spring", stiffness: 45, damping: 12, duration: 0.6 } 
    }
  };

  return (
    <PublicLayout>
      {/* 1. HERO SECTION WITH 3D PERSPECTIVE */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden pt-16 pb-24 lg:pt-28 lg:pb-36 bg-background">
        
        {/* Dynamic 3D Parallax Background elements */}
        <motion.div 
          style={{ y: yBg, rotate: rotateBg }}
          className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
        >
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[140px] opacity-80" />
          <div className="absolute top-1/3 right-1/4 w-[450px] h-[450px] bg-primary/10 rounded-full blur-[130px]" />
          
          {/* Floating 3D Casino Chips / Dices in background */}
          <motion.div 
            animate={{ y: [0, -25, 0], rotate: [0, 360] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[15%] left-[10%] opacity-20 text-amber-400 hidden md:block"
          >
            <Coins className="h-16 w-16" />
          </motion.div>
          
          <motion.div 
            animate={{ y: [0, 20, 0], rotate: [360, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[40%] right-[10%] opacity-20 text-purple-400 hidden md:block"
          >
            <Dices className="h-20 w-20" />
          </motion.div>
        </motion.div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Hero Left Content */}
            <div className="lg:col-span-7 space-y-6 text-left">
              {/* Tag Badge */}
              <motion.div 
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 60 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/80 border border-amber-500/20 text-xs sm:text-sm font-black text-amber-400 shadow-lg shadow-amber-500/5"
              >
                <Sparkles className="h-4 w-4 text-amber-400 animate-spin" style={{ animationDuration: "3s" }} />
                <span>🎰 PROGRESIVE SWEEPSTAKES & SOCIAL CASINO</span>
              </motion.div>

              {/* Headline */}
              <motion.h1 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-4xl sm:text-6xl xl:text-7xl font-black tracking-tight leading-[1.08] text-foreground"
              >
                Vegas Thrills <br />
                <span className="bg-gradient-to-r from-amber-400 via-primary to-purple-400 bg-clip-text text-transparent drop-shadow-sm">
                  Jackpot Jungle
                </span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="text-base sm:text-lg text-muted-foreground max-w-xl font-medium leading-relaxed"
              >
                Spin progressive slots, compete in sweeps tournaments, build your referral network, and chat live in our dedicated gaming messenger!
              </motion.p>

              {/* Action Call To Actions */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="pt-4 flex flex-col sm:flex-row items-center gap-4"
              >
                <Link
                  to="/auth"
                  className="w-full sm:w-auto px-8 py-4 rounded-full font-extrabold text-base bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 group active:scale-95 border border-amber-400/40"
                >
                  <Coins className="h-5 w-5 fill-black animate-pulse" />
                  <span>Claim Daily Chips & Play</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1.5 transition-transform" />
                </Link>

                <a
                  href="#download"
                  className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-base bg-secondary text-foreground hover:bg-accent border border-border/70 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Download className="h-5 w-5 text-primary" />
                  <span>Get Android App</span>
                </a>
              </motion.div>
            </div>

            {/* Hero Right - 3D Progressive Jackpot Shield & Live Counters */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.85, rotateY: 20 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ type: "spring", stiffness: 40, delay: 0.2 }}
              className="lg:col-span-5 flex flex-col items-center justify-center relative select-none"
              style={{ transformStyle: "preserve-3d" }}
            >
              <motion.div 
                whileHover={{ rotateY: 15, rotateX: -10, scale: 1.03 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-sm p-8 rounded-3xl bg-gradient-to-br from-card to-background border-2 border-amber-500/30 shadow-2xl relative overflow-hidden flex flex-col gap-6"
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />
                
                {/* Gold Crown */}
                <div className="mx-auto h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Crown className="h-8 w-8 animate-bounce" />
                </div>

                <div className="text-center space-y-1">
                  <span className="text-[10px] tracking-widest font-black uppercase text-amber-500 block">JUNGLE SUPER JACKPOT</span>
                  <div className="font-mono text-3xl sm:text-4xl font-black tracking-tight text-foreground bg-secondary/80 py-4 px-3 rounded-2xl border border-border/40 shadow-inner inline-block w-full">
                    <span className="bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 bg-clip-text text-transparent">
                      {formatJackpot(jackpot)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-border/40 pt-4 flex justify-between text-xs text-muted-foreground font-semibold">
                  <span className="flex items-center gap-1"><Flame className="h-4 w-4 text-orange-500" /> Hot Slots Active</span>
                  <span className="flex items-center gap-1"><Users className="h-4 w-4 text-primary" /> 14.8k Online</span>
                </div>
              </motion.div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* 2. CASINO FEATURES WITH 3D HOVER TILT EFFECTS */}
      <section className="py-20 bg-card/30 border-y border-border/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <motion.div 
            variants={scrollRevealVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="text-center max-w-3xl mx-auto mb-16 space-y-3"
          >
            <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400">Vegas Experience Redefined</h2>
            <p className="text-3xl sm:text-4xl font-black text-foreground">Play, Chat & Ascend the Rankings</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* Feature 1 */}
            <motion.div 
              variants={card3DVariants}
              initial="rest"
              whileHover="hover"
              className="p-6 rounded-3xl bg-background border border-border/60 shadow-lg cursor-default space-y-4 flex flex-col justify-between"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="space-y-4">
                <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Coins className="h-6 w-6" />
                </div>
                <h3 className="font-extrabold text-lg text-foreground">Mega Jackpot Slots</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Spin progressive slot machines, trigger scatter matches, and claim free spins instantly.
                </p>
              </div>
            </motion.div>

            {/* Feature 2 */}
            <motion.div 
              variants={card3DVariants}
              initial="rest"
              whileHover="hover"
              className="p-6 rounded-3xl bg-background border border-border/60 shadow-lg cursor-default space-y-4 flex flex-col justify-between"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="space-y-4">
                <div className="h-12 w-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <Dices className="h-6 w-6" />
                </div>
                <h3 className="font-extrabold text-lg text-foreground">High Roller Tables</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Join blackjack and poker sweepstakes rooms with full voice-chat support.
                </p>
              </div>
            </motion.div>

            {/* Feature 3 */}
            <motion.div 
              variants={card3DVariants}
              initial="rest"
              whileHover="hover"
              className="p-6 rounded-3xl bg-background border border-border/60 shadow-lg cursor-default space-y-4 flex flex-col justify-between"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <h3 className="font-extrabold text-lg text-foreground">Live Lobby Chat</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Share screenshots of your mega wins, send emojis, and react live to other high-rollers.
                </p>
              </div>
            </motion.div>

            {/* Feature 4 */}
            <motion.div 
              variants={card3DVariants}
              initial="rest"
              whileHover="hover"
              className="p-6 rounded-3xl bg-background border border-border/60 shadow-lg cursor-default space-y-4 flex flex-col justify-between"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="space-y-4">
                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Crown className="h-6 w-6" />
                </div>
                <h3 className="font-extrabold text-lg text-foreground">Exclusive VIP Perks</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Unlock cashbacks, milestone awards, and personal VIP host care by climbing the tiers.
                </p>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* 3. MOBILE APP 3D PREVIEW CARD */}
      <section id="download" className="py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            variants={scrollRevealVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="rounded-3xl bg-gradient-to-br from-card via-background to-secondary/30 border border-border/80 p-8 sm:p-12 lg:p-16 relative overflow-hidden shadow-2xl"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold">
                  <Smartphone className="h-4 w-4" /> Native Android Experience
                </div>
                <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground leading-tight">
                  Jackpot Jungle in Your Pocket
                </h2>
                <p className="text-muted-foreground text-sm sm:text-base leading-relaxed font-medium">
                  Experience fast casino slots, sweepstakes, and chat with our downloadable Android application. Safe, private, and optimized.
                </p>
                
                <div className="pt-4 flex flex-wrap gap-4">
                  <Link
                    to="/auth"
                    className="px-6 py-3.5 rounded-full font-bold text-sm bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-md flex items-center gap-2 active:scale-95"
                  >
                    <Globe className="h-4 w-4" /> Play Instant Web App
                  </Link>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); alert("Downloading Jackpot Jungle Android APK!"); }}
                    className="px-6 py-3.5 rounded-full font-semibold text-sm bg-secondary text-foreground hover:bg-accent border border-border/60 transition-all flex items-center gap-2 active:scale-95"
                  >
                    <Download className="h-4 w-4 text-emerald-400" /> Download APK
                  </a>
                </div>
              </div>

              {/* 3D Mockup Device Card */}
              <div className="relative flex items-center justify-center" style={{ perspective: "1000px" }}>
                <motion.div 
                  whileHover={{ rotateY: -15, rotateX: 10, scale: 1.02 }}
                  transition={{ duration: 0.4 }}
                  className="w-full max-w-sm rounded-3xl border-4 border-amber-500/35 bg-background shadow-2xl overflow-hidden p-5 space-y-4"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <img src="/icons/icon-256.webp" alt="App" className="h-8 w-8 rounded-lg" />
                      <span className="font-bold text-sm">Jackpot Jungle Casino</span>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-foreground">
                      <p className="font-extrabold text-amber-500 mb-0.5">🏆 LUCKY SPIN ACTIVE! 🎉</p>
                      <p>Claim your free daily spins to hit the $10,000.00 jackpot!</p>
                    </div>
                    <div className="p-3 rounded-xl bg-primary text-primary-foreground ml-6">
                      <p>Awesome! Just shared my referral link with friends.</p>
                    </div>
                  </div>
                </motion.div>
              </div>

            </div>
          </motion.div>
        </div>
      </section>

      {/* 4. VIP & REWARDS PREVIEW WITH VIEWPORT EFFECTS */}
      <section className="py-20 bg-card/20 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            
            {/* VIP Card */}
            <motion.div 
              variants={scrollRevealVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="p-8 rounded-3xl bg-gradient-to-br from-amber-500/15 via-card to-background border border-amber-500/30 space-y-6 relative overflow-hidden shadow-xl"
            >
              <div className="h-12 w-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Crown className="h-7 w-7" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-foreground">High-Roller VIP Lounge</h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                Enjoy daily cashback payouts, customized weekly streaks, private tournaments, and direct contact with VIP managers.
              </p>
              <Link to="/vip-club" className="inline-flex items-center gap-2 font-bold text-amber-400 hover:text-amber-300 text-sm">
                Explore VIP Club Tiers <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* Rewards Card */}
            <motion.div 
              variants={scrollRevealVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="p-8 rounded-3xl bg-gradient-to-br from-purple-500/15 via-card to-background border border-purple-500/30 space-y-6 relative overflow-hidden shadow-xl"
            >
              <div className="h-12 w-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Gift className="h-7 w-7" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-foreground">Free Daily Spins & Sweeps</h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                Spin the Daily Bonus Wheel to claim free credits. Invite friends with your referral code to receive lifetime commissions.
              </p>
              <Link to="/rewards" className="inline-flex items-center gap-2 font-bold text-purple-400 hover:text-purple-300 text-sm">
                Claim Daily Rewards <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>

          </div>
        </div>
      </section>

      {/* 5. SECURITY & TRUST HIGHLIGHTS */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          
          <motion.div 
            variants={scrollRevealVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="max-w-2xl mx-auto space-y-3"
          >
            <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400">Platform Standards</h2>
            <p className="text-3xl sm:text-4xl font-black text-foreground">Trusted Social Gaming Infrastructure</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-card border border-border/50 text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Lock className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-base text-foreground">Secure Privacy Protection</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">Multi-factor security layers and database RLS ensure all data and messages are protected.</p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border/50 text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-base text-foreground">Verified Fairness</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">certified random number generation algorithms drive spins, slots, and tournaments.</p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border/50 text-center space-y-3">
              <div className="h-12 w-12 mx-auto rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-base text-foreground">24/7 Premium Host Support</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">Dedicated chat admin moderators are active 24/7 to resolve any ticket instantly.</p>
            </div>
          </div>

        </div>
      </section>
    </PublicLayout>
  );
}
