import React, { useEffect, useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  MessageCircle, 
  Gift, 
  ShieldCheck, 
  Smartphone, 
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
  Award,
  Info,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { PublicLayout } from "@/components/landing/PublicLayout";

const SLOT_SYMBOLS = [
  { char: "🍒", label: "Cherry", multiplier: 3, color: "bg-red-500/10 border-red-500/30 text-red-500" },
  { char: "🍋", label: "Lemon", multiplier: 4, color: "bg-yellow-500/10 border-yellow-500/30 text-yellow-500" },
  { char: "🍊", label: "Orange", multiplier: 5, color: "bg-orange-500/10 border-orange-500/30 text-orange-500" },
  { char: "🔔", label: "Bell", multiplier: 8, color: "bg-amber-500/10 border-amber-500/30 text-amber-500" },
  { char: "💎", label: "Diamond", multiplier: 15, color: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" },
  { char: "👑", label: "Crown", multiplier: 25, color: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400" },
  { char: "7️⃣", label: "Seven", multiplier: 50, color: "bg-red-600/20 border-red-500/40 text-red-400" },
];

const VIP_LEVELS = [
  {
    name: "Bronze Medallion",
    img: "/bronze.png",
    deposit: "$100",
    reward: "$15",
    cashback: "5%",
    color: "from-amber-700 to-amber-900 border-amber-700/50 shadow-amber-500/5",
  },
  {
    name: "Silver Medallion",
    img: "/silver.png",
    deposit: "$250",
    reward: "$10",
    cashback: "8%",
    color: "from-slate-400 to-slate-600 border-slate-400/50 shadow-slate-500/5",
  },
  {
    name: "Gold Medallion",
    img: "/gold.png",
    deposit: "$500",
    reward: "$40",
    cashback: "12%",
    color: "from-yellow-500 to-amber-500 border-yellow-500/50 shadow-yellow-500/5",
  },
  {
    name: "Platinum Medallion",
    img: "/platium.png",
    deposit: "$1,000",
    reward: "$75",
    cashback: "18%",
    color: "from-cyan-400 to-blue-500 border-cyan-400/50 shadow-cyan-500/5",
  },
  {
    name: "Diamond Medallion",
    img: "/dimond.png",
    deposit: "$5,000",
    reward: "$100",
    cashback: "25%",
    color: "from-purple-500 to-indigo-600 border-purple-500/50 shadow-purple-500/5",
  },
];

const PAYLINE_PATHS = [
  // Line 0: Center horizontal row
  [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }],
  // Line 1: Top horizontal row
  [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }, { r: 0, c: 4 }],
  // Line 2: Bottom horizontal row
  [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }, { r: 2, c: 4 }],
  // Line 3: V-shape
  [{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }, { r: 1, c: 3 }, { r: 0, c: 4 }],
  // Line 4: Inverted V
  [{ r: 2, c: 0 }, { r: 1, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 3 }, { r: 2, c: 4 }]
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

  // Website Active Theme Observer
  const [activeTheme, setActiveTheme] = useState<"dark" | "light" | "jackpot" | "amoled" | "glass">("jackpot");

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const getTheme = () => {
      const cl = document.documentElement.classList;
      if (cl.contains("light")) return "light";
      if (cl.contains("amoled")) return "amoled";
      if (cl.contains("dark")) return "dark";
      if (cl.contains("glass")) return "glass";
      return "jackpot";
    };
    
    setActiveTheme(getTheme());

    const observer = new MutationObserver(() => {
      setActiveTheme(getTheme());
    });
    
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Theme based Slot Machine styles
  const themeStyles = {
    jackpot: {
      cabinet: "bg-zinc-900 border-4 border-amber-500/50 shadow-amber-500/20 text-foreground",
      button: "from-amber-500 via-yellow-400 to-amber-500 text-black hover:brightness-110",
      accentText: "text-amber-400",
      borderGlow: "border-amber-500/20",
      badge: "bg-amber-500/10 text-amber-400 border-amber-500/30"
    },
    amoled: {
      cabinet: "bg-black border-4 border-indigo-500/50 shadow-indigo-500/20 text-foreground",
      button: "from-indigo-600 via-purple-500 to-indigo-600 text-white hover:brightness-110",
      accentText: "text-indigo-400",
      borderGlow: "border-indigo-500/20",
      badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
    },
    dark: {
      cabinet: "bg-slate-900 border-4 border-blue-500/50 shadow-blue-500/20 text-foreground",
      button: "from-blue-600 via-cyan-500 to-blue-600 text-white hover:brightness-110",
      accentText: "text-blue-400",
      borderGlow: "border-blue-500/20",
      badge: "bg-blue-500/10 text-blue-400 border-blue-500/30"
    },
    light: {
      cabinet: "bg-white border-4 border-zinc-300 shadow-zinc-300/10 text-zinc-900",
      button: "from-zinc-800 to-zinc-950 text-white hover:bg-zinc-700",
      accentText: "text-zinc-800",
      borderGlow: "border-zinc-200",
      badge: "bg-zinc-100 text-zinc-800 border-zinc-300"
    },
    glass: {
      cabinet: "bg-white/10 backdrop-blur-xl border-4 border-white/20 shadow-white/5 text-foreground",
      button: "from-cyan-500 via-teal-400 to-cyan-500 text-black hover:brightness-110",
      accentText: "text-cyan-400",
      borderGlow: "border-white/10",
      badge: "bg-white/10 text-cyan-400 border-white/20"
    }
  }[activeTheme] || {
    cabinet: "bg-zinc-900 border-4 border-amber-500/50 shadow-amber-500/20 text-foreground",
    button: "from-amber-500 via-yellow-400 to-amber-500 text-black hover:brightness-110",
    accentText: "text-amber-400",
    borderGlow: "border-amber-500/20",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/30"
  };

  // Fun Slot Machine Game state (5 Columns x 3 Rows)
  const [balance, setBalance] = useState(10000);
  const [bet, setBet] = useState(100);
  
  // Reels 2D state: reels[colIndex][rowIndex]
  const [reels, setReels] = useState<string[][]>([
    ["💎", "🔔", "🍒"], // Reel 1
    ["👑", "🍋", "🍀"], // Reel 2
    ["7️⃣", "🍊", "🍒"], // Reel 3
    ["💎", "🔔", "👑"], // Reel 4
    ["👑", "🍋", "7️⃣"], // Reel 5
  ]);

  const [reelSpinning, setReelSpinning] = useState([false, false, false, false, false]);
  const [winAmount, setWinAmount] = useState<number | null>(null);
  const [winType, setWinType] = useState<string | null>(null);
  const [winningLines, setWinningLines] = useState<number[]>([]);
  const [autoSpin, setAutoSpin] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Auto spin timer reference
  const autoSpinTimeoutRef = useRef<any>(null);

  // Reset balance on mount / page refresh
  useEffect(() => {
    setBalance(10000);
    return () => {
      if (autoSpinTimeoutRef.current) clearTimeout(autoSpinTimeoutRef.current);
    };
  }, []);

  const isSpinning = reelSpinning.some(v => v);

  const handleSpin = () => {
    if (isSpinning || balance < bet) {
      setAutoSpin(false);
      return;
    }

    // Deduct bet and reset states
    setBalance((prev) => prev - bet);
    setWinAmount(null);
    setWinType(null);
    setWinningLines([]);

    // Trigger spin state on all reels
    setReelSpinning([true, true, true, true, true]);

    // Choose final target symbols for all 5 reels (3 symbols each)
    const targetReels = Array.from({ length: 5 }, () => 
      Array.from({ length: 3 }, () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)].char)
    );

    // Staggered stop Reel 1
    setTimeout(() => {
      setRIndex(0, targetReels[0]);
    }, 600);

    // Staggered stop Reel 2
    setTimeout(() => {
      setRIndex(1, targetReels[1]);
    }, 1100);

    // Staggered stop Reel 3
    setTimeout(() => {
      setRIndex(2, targetReels[2]);
    }, 1600);

    // Staggered stop Reel 4
    setTimeout(() => {
      setRIndex(3, targetReels[3]);
    }, 2100);

    // Staggered stop Reel 5 & Payout Calculations
    setTimeout(() => {
      setRIndex(4, targetReels[4]);

      // Calculate payline matches
      let totalWin = 0;
      const matchedLines: number[] = [];

      PAYLINE_PATHS.forEach((path, lineIdx) => {
        const s1 = targetReels[0][path[0].r];
        const s2 = targetReels[1][path[1].r];
        const s3 = targetReels[2][path[2].r];
        const s4 = targetReels[3][path[3].r];
        const s5 = targetReels[4][path[4].r];

        const symbolInfo = SLOT_SYMBOLS.find(s => s.char === s1);
        if (!symbolInfo) return;

        if (s1 === s2 && s2 === s3) {
          matchedLines.push(lineIdx);
          if (s3 === s4 && s4 === s5) {
            totalWin += bet * symbolInfo.multiplier * 2.5; // 5 matched
          } else if (s3 === s4) {
            totalWin += bet * symbolInfo.multiplier * 1.5; // 4 matched
          } else {
            totalWin += bet * symbolInfo.multiplier; // 3 matched
          }
        }
      });

      if (totalWin > 0) {
        const payout = Math.round(totalWin);
        setWinAmount(payout);
        setWinningLines(matchedLines);
        setBalance((prev) => prev + payout);

        if (payout >= bet * 10) {
          setWinType("🏆 MEGA JACKPOT WIN!");
        } else if (payout >= bet * 4) {
          setWinType("🔥 BIG CASINO WIN!");
        } else {
          setWinType("🎉 WINNER!");
        }
      }

      // Handle next Auto Spin
      if (autoSpin) {
        autoSpinTimeoutRef.current = setTimeout(() => {
          handleSpin();
        }, 2200);
      }

    }, 2600);
  };

  // Toggle Auto Spin
  useEffect(() => {
    if (autoSpin && !isSpinning && winAmount === null) {
      handleSpin();
    }
    if (!autoSpin && autoSpinTimeoutRef.current) {
      clearTimeout(autoSpinTimeoutRef.current);
    }
  }, [autoSpin]);

  const setRIndex = (colIdx: number, symbols: string[]) => {
    setReels(prev => {
      const copy = [...prev];
      copy[colIdx] = symbols;
      return copy;
    });
    setReelSpinning(prev => {
      const copy = [...prev];
      copy[colIdx] = false;
      return copy;
    });
  };

  // Adjust Bet helper
  const adjustBet = (dir: "up" | "down") => {
    if (isSpinning) return;
    const bets = [100, 250, 500, 1000, 2500];
    const currentIdx = bets.indexOf(bet);
    if (dir === "up" && currentIdx < bets.length - 1) {
      setBet(bets[currentIdx + 1]);
    } else if (dir === "down" && currentIdx > 0) {
      setBet(bets[currentIdx - 1]);
    }
  };

  // Scroll animations
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

  // Sub-component for individual staggering reels
  const RenderReel = ({ 
    colIndex, 
    symbols, 
    spinning 
  }: { 
    colIndex: number; 
    symbols: string[]; 
    spinning: boolean 
  }) => {
    const duplicateSymbols = [...SLOT_SYMBOLS, ...SLOT_SYMBOLS, ...SLOT_SYMBOLS];

    return (
      <div className="w-full h-[220px] sm:h-[280px] overflow-hidden relative bg-black/95 rounded-2xl border border-zinc-800 flex justify-center items-center shadow-inner">
        {/* vignette shading */}
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black pointer-events-none z-10" />
        
        {spinning ? (
          <div 
            style={{ animation: `slotScroll 0.12s linear infinite` }}
            className="flex flex-col gap-4 absolute"
          >
            {duplicateSymbols.map((s, i) => (
              <div 
                key={i} 
                className="h-16 w-16 sm:h-20 sm:w-20 flex items-center justify-center text-3xl sm:text-4xl select-none"
              >
                {s.char}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col h-full justify-around items-center py-2 relative z-0 w-full">
            {symbols.map((symbol, rowIdx) => {
              const matched = SLOT_SYMBOLS.find(s => s.char === symbol);
              return (
                <motion.div
                  key={rowIdx}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 14 }}
                  className={`h-14 w-14 sm:h-18 sm:w-18 rounded-xl border flex flex-col items-center justify-center shadow-md ${matched?.color || ""}`}
                >
                  <span className="text-2xl sm:text-3xl select-none">{symbol}</span>
                  <span className="text-[7px] font-black tracking-widest uppercase opacity-75 font-mono select-none">
                    {matched?.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Helper to map grid coordinates to SVG percentages
  const getLinePoints = (line: { r: number; c: number }[]) => {
    return line.map(pt => `${pt.c * 20 + 10}%, ${pt.r * 33.3 + 16.6}%`).join(" L ");
  };

  return (
    <PublicLayout>
      
      {/* Dynamic Keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slotScroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      `}} />

      {/* 1. HERO SECTION */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden pt-16 pb-24 lg:pt-28 lg:pb-36 bg-background">
        <motion.div 
          style={{ y: yBg, rotate: rotateBg }}
          className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
        >
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[140px] opacity-80" />
          <div className="absolute top-1/3 right-1/4 w-[450px] h-[450px] bg-primary/10 rounded-full blur-[130px]" />
          
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
            
            {/* Hero Left */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <motion.div 
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 60 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/80 border border-amber-500/20 text-xs sm:text-sm font-black text-amber-400 shadow-lg shadow-amber-500/5"
              >
                <Sparkles className="h-4 w-4 text-amber-400 animate-spin" style={{ animationDuration: "3s" }} />
                <span>🎰 PROGRESSIVE SWEEPSTAKES & SOCIAL CASINO</span>
              </motion.div>

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

              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="text-base sm:text-lg text-muted-foreground max-w-xl font-medium leading-relaxed"
              >
                Spin progressive slots, compete in sweeps tournaments, build your referral network, and chat live in our dedicated gaming messenger!
              </motion.p>

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

            {/* Hero Right - Jackpot Panel */}
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

      {/* INTERACTIVE 5x3 SLOT MACHINE MINI-GAME */}
      <section className="py-20 relative bg-zinc-950 overflow-hidden border-y border-border/40 select-none">
        <div className="absolute inset-0 bg-radial-gradient from-amber-500/5 to-transparent pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
          
          <div className="text-center space-y-3 mb-10">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-widest ${themeStyles.badge}`}>
              <Flame className="h-3.5 w-3.5 fill-current" /> Fun Mode Slots
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-foreground">Jungle Spin & Win</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Real casino action! Balance starts at **$10,000.00** and resets on refresh. Connect matching symbols across paylines to win big!
            </p>
          </div>

          {/* Slot Machine Bezel Cabinet */}
          <div className={`relative mx-auto max-w-3xl rounded-3xl p-4 sm:p-6 flex flex-col gap-5 border-4 transition-all duration-300 ${themeStyles.cabinet}`}>
            
            {/* Header board */}
            <div className="flex justify-between items-center bg-black/85 px-4 py-3 rounded-xl border border-zinc-800 shadow-inner">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
                <span className="font-extrabold text-[10px] sm:text-xs tracking-widest uppercase font-mono text-zinc-400">
                  GRAND JACKPOT: <span className={themeStyles.accentText}>$2,000.00</span>
                </span>
              </div>
              <button 
                onClick={() => setShowInfo(true)}
                className="text-zinc-400 hover:text-foreground p-1 rounded-md transition-colors cursor-pointer"
                title="Payout Information"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>

            {/* 5x3 Reels Container */}
            <div className="relative bg-zinc-950 p-2 sm:p-4 rounded-2xl border border-zinc-800 shadow-inner">
              <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
                {reels.map((symbols, colIdx) => (
                  <RenderReel 
                    key={colIdx} 
                    colIndex={colIdx} 
                    symbols={symbols} 
                    spinning={reelSpinning[colIdx]} 
                  />
                ))}
              </div>

              {/* Glowing SVG Winning Paylines Overlay */}
              <svg className="absolute inset-0 z-20 pointer-events-none w-full h-full p-2 sm:p-4">
                {winningLines.map((lineIdx) => {
                  const line = PAYLINE_PATHS[lineIdx];
                  const colors = ["#ec4899", "#22c55e", "#eab308", "#06b6d4", "#a855f7"];
                  return (
                    <motion.path
                      key={lineIdx}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      d={`M ${getLinePoints(line)}`}
                      stroke={colors[lineIdx % colors.length]}
                      strokeWidth="4"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                    />
                  );
                })}
              </svg>
            </div>

            {/* Cabinet HUD - Bet/Win Board */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 bg-black/90 p-4 rounded-xl border border-zinc-800 font-mono text-center shadow-inner">
              <div className="space-y-0.5">
                <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider block">Fun Balance</span>
                <span className={`font-black text-sm sm:text-lg block ${themeStyles.accentText}`}>
                  ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="space-y-0.5 border-x border-zinc-800">
                <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider block">Win Display</span>
                <AnimatePresence mode="wait">
                  {winAmount !== null ? (
                    <motion.span 
                      key={winAmount}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="font-black text-sm sm:text-lg text-green-400 block animate-pulse"
                    >
                      ${winAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </motion.span>
                  ) : (
                    <span className="font-black text-sm sm:text-lg text-zinc-600 block">
                      $0.00
                    </span>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider block">Total Bet</span>
                <span className="font-black text-sm sm:text-lg text-foreground block">
                  ${bet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Cabinet Action Dashboard Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950 p-3 rounded-2xl border border-zinc-800/80">
              
              {/* Bet Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => adjustBet("down")}
                  disabled={isSpinning}
                  className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 text-foreground font-black text-base flex items-center justify-center hover:bg-zinc-700 disabled:opacity-50 cursor-pointer active:scale-90 transition-transform"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="px-3 text-center min-w-[70px]">
                  <span className="text-[9px] text-muted-foreground uppercase block font-semibold">BET SIZE</span>
                  <span className="font-bold text-xs sm:text-sm font-mono">${bet}</span>
                </div>
                <button
                  onClick={() => adjustBet("up")}
                  disabled={isSpinning}
                  className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 text-foreground font-black text-base flex items-center justify-center hover:bg-zinc-700 disabled:opacity-50 cursor-pointer active:scale-90 transition-transform"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Status Win Text Banner */}
              <div className="flex-1 text-center min-w-[120px] h-8 flex items-center justify-center">
                {winType && winAmount !== null && (
                  <span className="text-[11px] sm:text-xs font-black tracking-wider text-green-400 animate-pulse bg-green-500/10 border border-green-500/25 px-2.5 py-1 rounded-full uppercase">
                    {winType}
                  </span>
                )}
                {isSpinning && (
                  <span className="text-[10px] font-bold tracking-widest text-zinc-500 animate-pulse uppercase">
                    Rolling reels...
                  </span>
                )}
              </div>

              {/* Spin & Auto Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoSpin(!autoSpin)}
                  className={`h-11 px-4 rounded-xl font-bold text-xs tracking-wider uppercase border transition-all cursor-pointer active:scale-95 ${
                    autoSpin 
                      ? "bg-red-500 text-white border-red-400" 
                      : "bg-zinc-800 text-muted-foreground border-zinc-700 hover:text-foreground hover:bg-zinc-700"
                  }`}
                >
                  {autoSpin ? "Stop Auto" : "Auto Spin"}
                </button>

                <button
                  onClick={handleSpin}
                  disabled={isSpinning || balance < bet}
                  className={`h-11 px-8 rounded-xl font-black text-xs sm:text-sm tracking-wider uppercase border shadow-md active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none bg-gradient-to-r ${themeStyles.button}`}
                >
                  <RotateCcw className={`h-4 w-4 ${isSpinning ? "animate-spin" : ""}`} />
                  <span>Spin</span>
                </button>
              </div>

            </div>

          </div>
        </div>

        {/* Payout Information Modal Pop */}
        <AnimatePresence>
          {showInfo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-xs" 
                onClick={() => setShowInfo(false)} 
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full text-foreground shadow-2xl z-10 space-y-4"
              >
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <h3 className="font-extrabold text-base flex items-center gap-1.5">
                    <Trophy className="h-5 w-5 text-amber-400" /> Symbol Payout Guide
                  </h3>
                  <button 
                    onClick={() => setShowInfo(false)}
                    className="p-1 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-foreground transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {SLOT_SYMBOLS.map((symbol) => (
                    <div 
                      key={symbol.label}
                      className="flex items-center justify-between p-2 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{symbol.char}</span>
                        <span className="font-bold text-zinc-400">{symbol.label}</span>
                      </div>
                      <div className="space-y-0.5 text-right text-[10px]">
                        <p><span className="text-zinc-500">5 symbols:</span> <span className="text-green-400 font-bold">{(symbol.multiplier * 2.5)}x</span></p>
                        <p><span className="text-zinc-500">4 symbols:</span> <span className="text-amber-400">{(symbol.multiplier * 1.5)}x</span></p>
                        <p><span className="text-zinc-500">3 symbols:</span> <span className="text-foreground">{(symbol.multiplier)}x</span></p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-muted-foreground leading-relaxed text-center italic">
                  Wins pay consecutively starting from leftmost Reel 1 across the active horizontal or V-shaped paylines.
                </p>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </section>

      {/* 2. CASINO FEATURES */}
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

      {/* VIP CLUB SHOWCASE GRID */}
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
              Progress through the tiers by making deposits to unlock permanent cashback rates and claim free welcome rewards!
            </p>
          </motion.div>

          {/* VIP Ranks Grid Deck */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {VIP_LEVELS.map((level, idx) => (
              <motion.div
                key={level.name}
                variants={card3DVariants}
                initial="rest"
                whileHover="hover"
                className={`p-6 rounded-3xl bg-gradient-to-br from-card to-background border-2 shadow-xl relative overflow-hidden flex flex-col justify-between items-center text-center gap-6 ${level.color}`}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base text-foreground leading-tight">
                    {level.name.split(" ")[0]}
                  </h3>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-mono">
                    Tier {idx + 1}
                  </span>
                </div>

                <div className="h-28 w-28 flex items-center justify-center select-none pointer-events-none">
                  <img 
                    src={level.img} 
                    alt={level.name} 
                    className="max-h-24 w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)] animate-pulse"
                    style={{ animationDuration: `${3 + idx}s` }}
                  />
                </div>

                {/* Requirements / Rewards */}
                <div className="w-full bg-black/55 p-3 rounded-xl border border-zinc-800 space-y-1 font-mono text-xs text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground uppercase text-[8px] tracking-wider font-semibold">Deposit:</span>
                    <span className="font-bold text-foreground">{level.deposit}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-zinc-800 pt-1.5 mt-1">
                    <span className="text-muted-foreground uppercase text-[8px] tracking-wider font-semibold">Reward:</span>
                    <span className="font-bold text-green-400">{level.reward} Free</span>
                  </div>
                </div>

                {/* Benefits */}
                <div className="w-full space-y-1 border-t border-border/40 pt-4 text-left font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground uppercase text-[8px] tracking-wider font-semibold">Cashback:</span>
                    <span className="font-bold text-amber-400">{level.cashback}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center pt-10">
            <Link 
              to="/vip" 
              className="inline-flex items-center gap-2 font-black text-sm bg-purple-500/10 border border-purple-500/30 text-purple-400 px-6 py-3 rounded-full hover:bg-purple-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <span>Explore VIP Club Tiers & Perks Page</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

        </div>
      </section>

      {/* 3. MOBILE APP PREVIEW */}
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
                    <Download className="h-4.5 w-4.5 text-emerald-400" /> Download APK
                  </a>
                </div>
              </div>

              {/* Mockup Device */}
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

      {/* 5. SECURITY & TRUST */}
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
