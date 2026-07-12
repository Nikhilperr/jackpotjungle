import React, { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  MessageCircle, 
  Trophy, 
  Gift, 
  ShieldCheck, 
  Smartphone, 
  Zap, 
  Users, 
  Crown, 
  ArrowRight, 
  Download,
  Lock,
  Globe,
  Coins,
  Dices,
  Flame,
  RotateCcw,
  Volume2,
  DollarSign,
  Award
} from "lucide-react";
import { PublicLayout } from "@/components/landing/PublicLayout";

const SLOT_SYMBOLS = [
  { char: "🍒", label: "Cherry", multiplier: 3, color: "from-red-500 to-rose-600" },
  { char: "🍋", label: "Lemon", multiplier: 4, color: "from-yellow-400 to-amber-500" },
  { char: "🍊", label: "Orange", multiplier: 5, color: "from-orange-400 to-amber-600" },
  { char: "🔔", label: "Bell", multiplier: 8, color: "from-yellow-500 to-yellow-300" },
  { char: "💎", label: "Diamond", multiplier: 15, color: "from-cyan-400 to-blue-500" },
  { char: "👑", label: "Crown", multiplier: 25, color: "from-yellow-600 to-amber-400" },
  { char: "7️⃣", label: "Seven", multiplier: 50, color: "from-red-600 to-rose-800" },
];

const VIP_LEVELS = [
  {
    name: "Bronze Medallion",
    img: "/bronze.png",
    cashback: "5%",
    welcome: "$1,000",
    req: "Level 1+",
    color: "from-amber-700 to-amber-900 border-amber-700/50",
    glow: "shadow-amber-500/10",
  },
  {
    name: "Silver Medallion",
    img: "/silver.png",
    cashback: "8%",
    welcome: "$5,000",
    req: "Level 10+",
    color: "from-slate-400 to-slate-600 border-slate-400/50",
    glow: "shadow-slate-500/10",
  },
  {
    name: "Gold Medallion",
    img: "/gold.png",
    cashback: "12%",
    welcome: "$15,000",
    req: "Level 25+",
    color: "from-yellow-500 to-amber-500 border-yellow-500/50",
    glow: "shadow-yellow-500/10",
  },
  {
    name: "Platinum Medallion",
    img: "/platium.png",
    cashback: "18%",
    welcome: "$50,000",
    req: "Level 50+",
    color: "from-cyan-400 to-blue-500 border-cyan-400/50",
    glow: "shadow-cyan-500/10",
  },
  {
    name: "Diamond Medallion",
    img: "/dimond.png",
    cashback: "25%",
    welcome: "$200,000",
    req: "Level 100+",
    color: "from-purple-500 to-indigo-600 border-purple-500/50",
    glow: "shadow-purple-500/10",
  },
];

export function LandingContainer() {
  const [jackpot, setJackpot] = useState(8742510.45);

  // Progressive jackpot animation
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

  // Fun Slot Machine Game state
  const [balance, setBalance] = useState(10000);
  const [bet, setBet] = useState(100);
  const [reels, setReels] = useState(["💎", "👑", "7️⃣"]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState<number | null>(null);
  const [winType, setWinType] = useState<string | null>(null);

  // Reset balance on page refresh/mount
  useEffect(() => {
    setBalance(10000);
  }, []);

  const handleSpin = () => {
    if (isSpinning || balance < bet) return;

    setBalance((prev) => prev - bet);
    setIsSpinning(true);
    setWinAmount(null);
    setWinType(null);

    let startTime = Date.now();
    const duration = 1800; // spin duration in ms
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      // Animate reels randomly while spinning
      setReels([
        SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)].char,
        SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)].char,
        SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)].char,
      ]);

      if (elapsed > duration) {
        clearInterval(interval);
        
        // Pick final result
        const r1 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
        const r2 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
        const r3 = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
        
        setReels([r1.char, r2.char, r3.char]);
        setIsSpinning(false);
        
        // Check payout
        let win = 0;
        let payoutMsg = "";

        if (r1.char === r2.char && r2.char === r3.char) {
          // 3 of a kind
          win = bet * r1.multiplier;
          payoutMsg = r1.multiplier >= 15 ? "🏆 MEGA WIN!" : "🔥 BIG WIN!";
        } else if (r1.char === r2.char || r2.char === r3.char || r1.char === r3.char) {
          // 2 of a kind
          const matchingSymbol = r1.char === r2.char ? r1 : r3;
          win = bet * Math.max(1, Math.round(matchingSymbol.multiplier / 2));
          payoutMsg = "🎉 WIN!";
        }

        if (win > 0) {
          setWinAmount(win);
          setWinType(payoutMsg);
          setBalance((prev) => prev + win);
        }
      }
    }, 60);
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
                <span>🎰 PROGRESSIVE SWEEPSTAKES & SOCIAL CASINO</span>
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
                  to="/app/auth"
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

      {/* NEW SECTION: INTERACTIVE SLOT MACHINE MINI-GAME */}
      <section className="py-20 relative bg-zinc-950 overflow-hidden border-y border-amber-500/25">
        {/* Glowing aura */}
        <div className="absolute inset-0 bg-radial-gradient from-amber-500/5 to-transparent pointer-events-none" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
          
          <div className="text-center space-y-3 mb-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold border border-amber-500/30 uppercase tracking-widest">
              <Flame className="h-3.5 w-3.5 fill-amber-400" /> Fun Mode Slots
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-foreground">Jungle Spin & Win</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Feel the heat! Hit the reels with virtual funds. Balance resets back to **$10,000.00** on page refresh.
            </p>
          </div>

          {/* Slot Cabinet Wrapper */}
          <div className="relative mx-auto max-w-lg bg-zinc-900 border-4 border-amber-500/40 rounded-3xl p-5 sm:p-8 shadow-2xl flex flex-col gap-6">
            
            {/* Cabinet Top Header */}
            <div className="text-center bg-black/80 py-3 rounded-xl border border-zinc-800 shadow-inner flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
              <span className="font-extrabold text-sm tracking-wider uppercase text-amber-400 font-mono">
                Jungle Deluxe Reels
              </span>
              <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
            </div>

            {/* The Reels Block */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 bg-black p-4 sm:p-6 rounded-2xl border border-zinc-800 shadow-inner relative overflow-hidden">
              {reels.map((symbol, idx) => {
                const matchedSymbol = SLOT_SYMBOLS.find(s => s.char === symbol);
                return (
                  <div 
                    key={idx} 
                    className="relative aspect-[3/4] bg-gradient-to-b from-zinc-800 to-zinc-900 border-2 border-zinc-700/80 rounded-xl flex flex-col items-center justify-center shadow-lg transition-all"
                  >
                    <div className="absolute inset-0 bg-radial-gradient from-white/5 to-transparent rounded-xl pointer-events-none" />
                    
                    {/* Symbol Display */}
                    <motion.span 
                      key={symbol + (isSpinning ? "-spin" : "-stop")}
                      initial={isSpinning ? { y: -80, opacity: 0 } : { y: 0, opacity: 1, scale: 1 }}
                      animate={isSpinning ? { y: 80, opacity: [0, 1, 0] } : { scale: [0.9, 1.05, 1] }}
                      transition={isSpinning ? { repeat: Infinity, duration: 0.12, ease: "linear" } : { duration: 0.2 }}
                      className="text-4xl sm:text-6xl select-none"
                    >
                      {symbol}
                    </motion.span>

                    {/* Symbol Indicator text */}
                    {!isSpinning && matchedSymbol && (
                      <span className="absolute bottom-2 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                        {matchedSymbol.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Status Messages Panel */}
            <div className="h-14 flex items-center justify-center text-center">
              <AnimatePresence mode="wait">
                {winAmount !== null && winType && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="space-y-0.5"
                  >
                    <p className="text-amber-400 font-black text-xl tracking-wider animate-bounce">
                      {winType}
                    </p>
                    <p className="text-green-400 font-bold text-sm">
                      Payout: +${winAmount.toLocaleString()}
                    </p>
                  </motion.div>
                )}
                {isSpinning && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.5, 1, 0.5], transition: { repeat: Infinity, duration: 0.8 } }}
                    className="text-amber-500 font-extrabold text-sm uppercase tracking-widest font-mono"
                  >
                    🎲 Reels rolling... 🎰
                  </motion.p>
                )}
                {!isSpinning && winAmount === null && (
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-muted-foreground text-xs font-semibold"
                  >
                    Select your bet amount and hit SPIN!
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* HUD / Display Counter */}
            <div className="grid grid-cols-2 gap-4 bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 font-mono text-center shadow-inner">
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Balance</span>
                <span className="text-amber-400 font-black text-lg sm:text-xl">
                  ${balance.toLocaleString()}
                </span>
              </div>
              <div className="space-y-0.5 border-l border-zinc-800">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Bet Size</span>
                <span className="text-foreground font-black text-lg sm:text-xl">
                  ${bet.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Interactive HUD Controls */}
            <div className="space-y-4 pt-2">
              {/* Quick Bet Picker */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest font-mono select-none">
                  Set Bet:
                </span>
                <div className="flex gap-1.5">
                  {[100, 250, 500, 1000].map((val) => (
                    <button
                      key={val}
                      onClick={() => !isSpinning && setBet(val)}
                      disabled={isSpinning}
                      className={`h-9 px-3 rounded-lg font-mono text-xs font-extrabold transition-all active:scale-95 ${
                        bet === val 
                          ? "bg-amber-500 text-black border border-amber-300 shadow-md shadow-amber-500/20" 
                          : "bg-zinc-800 text-muted-foreground border border-zinc-700 hover:text-foreground hover:bg-zinc-700"
                      }`}
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Spin Button */}
              <button
                onClick={handleSpin}
                disabled={isSpinning || balance < bet}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black font-extrabold text-base sm:text-lg tracking-wider uppercase border border-amber-300/40 shadow-xl shadow-amber-500/10 hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className={`h-5 w-5 ${isSpinning ? "animate-spin" : ""}`} />
                <span>{balance < bet ? "Insufficient Funds" : "Spin Reels"}</span>
              </button>
            </div>

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

      {/* NEW SECTION: VIP CLUB SHOWCASE GRID */}
      <section className="py-24 relative overflow-hidden bg-background">
        <div className="absolute inset-0 bg-radial-gradient from-purple-500/5 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          
          <motion.div 
            variants={scrollRevealVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="text-center max-w-3xl mx-auto mb-20 space-y-3"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-bold border border-purple-500/20 uppercase tracking-widest">
              <Award className="h-3.5 w-3.5" /> High-Roller Status
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-foreground">Jackpot Canopy VIP Ranks</h2>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed font-medium max-w-lg mx-auto">
              Active play builds VIP XP. Progress through the tiers to permanently enhance cashbacks, match boosts, and host support.
            </p>
          </motion.div>

          {/* VIP Ranks Flexbox/Grid Deck */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {VIP_LEVELS.map((level, idx) => (
              <motion.div
                key={level.name}
                variants={card3DVariants}
                initial="rest"
                whileHover="hover"
                className={`p-6 rounded-3xl bg-gradient-to-br from-card to-background border-2 shadow-xl relative overflow-hidden flex flex-col justify-between items-center text-center gap-6 ${level.color} ${level.glow}`}
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Header Title */}
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base text-foreground leading-tight">
                    {level.name.split(" ")[0]}
                  </h3>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-mono">
                    {level.req}
                  </span>
                </div>

                {/* Medallion Medal Image */}
                <div className="h-28 w-28 flex items-center justify-center select-none pointer-events-none">
                  <img 
                    src={level.img} 
                    alt={level.name} 
                    className="max-h-24 w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)] animate-pulse"
                    style={{ animationDuration: `${3 + idx}s` }}
                  />
                </div>

                {/* Benefits List */}
                <div className="w-full space-y-2 border-t border-border/40 pt-4 text-left font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground uppercase text-[9px] tracking-wider font-semibold">Cashback:</span>
                    <span className="font-bold text-amber-400">{level.cashback}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground uppercase text-[9px] tracking-wider font-semibold">Welcome:</span>
                    <span className="font-bold text-foreground">{level.welcome}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center pt-10">
            <Link 
              to="/vip" 
              className="inline-flex items-center gap-2 font-black text-sm bg-purple-500/10 border border-purple-500/30 text-purple-400 px-6 py-3 rounded-full hover:bg-purple-500/20 active:scale-95 transition-all"
            >
              <span>Explore Extensive VIP Tiers & Perks</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
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
                    to="/app/auth"
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

      {/* 5. SECURITY & TRUST HIGHLIGHTS */}
      <section className="py-20 border-t border-border/40">
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
