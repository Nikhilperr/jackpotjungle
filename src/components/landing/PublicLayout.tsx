import React, { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  Menu, 
  X, 
  Download, 
  LogIn, 
  UserPlus, 
  ShieldCheck, 
  Trophy, 
  Gift, 
  Zap, 
  ChevronRight,
  Crown,
  Users
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "Download", path: "/download", icon: Download },
    { name: "VIP Club", path: "/vip", icon: Crown },
    { name: "Rewards", path: "/rewards", icon: Gift },
    { name: "Promotions", path: "/promotions", icon: Zap },
    { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
    { name: "Referrals", path: "/referrals", icon: Users },
  ];

  const secondaryLinks = [
    { name: "Support", path: "/support" },
    { name: "FAQ", path: "/faq" },
    { name: "Blog", path: "/blog" },
  ];

  return (
    <div className="h-screen w-full overflow-y-auto bg-background text-foreground flex flex-col font-sans selection:bg-primary selection:text-primary-foreground transition-colors duration-300">
      
      {/* Top Announcement Banner */}
      <div className="bg-gradient-to-r from-amber-500 via-primary to-purple-600 text-white text-xs py-2 px-4 text-center font-bold flex items-center justify-center gap-2 shadow-inner shrink-0 z-50">
        <Sparkles className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "6s" }} />
        <span className="truncate">🎰 Welcome to Jackpot Jungle Social Casino! Claim your daily free coins & VIP bonuses today!</span>
        <Link to="/rewards" className="underline font-black hover:opacity-90 ml-1 inline-flex items-center gap-0.5 shrink-0">
          Claim Free Chips <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Main Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl transition-all duration-200 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          
          {/* Logo Brand */}
          <Link to="/" className="flex items-center gap-2 sm:gap-3 group shrink-0">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-xl bg-primary/30 blur-md group-hover:bg-primary/50 transition-all" />
              <img 
                src="/icons/icon-256.webp" 
                alt="Jackpot Jungle Logo" 
                className="relative h-10 w-10 sm:h-11 sm:w-11 rounded-xl object-cover border border-border/40 shadow-md group-hover:scale-105 transition-transform" 
              />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight leading-none bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text">
                Jackpot Jungle
              </span>
              <span className="text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-primary mt-1">
                Messenger & Gaming
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links - Optimized for exact single-line alignment */}
          <nav className="hidden lg:flex items-center flex-nowrap shrink-0 lg:gap-0.5 xl:gap-1.5">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              const Icon = link.icon;
              return (
                <Link
                  key={link.path}
                  to={link.path as any}
                  className={`px-2 py-1.5 xl:px-3 xl:py-2 rounded-full text-xs xl:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    isActive 
                      ? "bg-primary/15 text-primary font-semibold" 
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {Icon && <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />}
                  <span>{link.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Desktop Right Actions & Theme Toggle */}
          <div className="hidden lg:flex items-center gap-2 xl:gap-3 shrink-0">
            <ThemeToggle className="shadow-sm border border-border/40" />
            
            <Link
              to="/app/auth"
              className="px-3 py-2 xl:px-4 xl:py-2 rounded-full text-xs xl:text-sm font-semibold text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 border border-border/50 whitespace-nowrap"
            >
              <LogIn className="h-4 w-4 text-primary" />
              <span>Login</span>
            </Link>

            <Link
              to="/app/auth"
              className="px-4 py-2.5 xl:px-5 xl:py-2.5 rounded-full text-xs xl:text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg hover:shadow-primary/25 flex items-center gap-1.5 active:scale-95 whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" />
              <span>Register</span>
            </Link>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex items-center gap-2 lg:hidden shrink-0">
            <ThemeToggle className="shadow-sm border border-border/40" />
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-secondary text-foreground hover:bg-accent transition-colors cursor-pointer"
              aria-label="Open mobile menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-out Sidebar Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Dark Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 lg:hidden"
            />

            {/* Sidebar Cabinet Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-card border-l border-border shadow-2xl flex flex-col justify-between p-6 lg:hidden"
            >
              {/* Drawer Top / Header */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img 
                      src="/icons/icon-256.webp" 
                      alt="Logo" 
                      className="h-8 w-8 rounded-lg object-cover border border-border/40 shadow-sm" 
                    />
                    <span className="font-extrabold text-base text-foreground tracking-tight">
                      Jackpot Jungle
                    </span>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Navigation Links Grid List */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground font-mono">
                    Navigation
                  </span>
                  <nav className="flex flex-col gap-1.5">
                    {navLinks.map((link) => {
                      const isActive = location.pathname === link.path;
                      const Icon = link.icon;
                      return (
                        <Link
                          key={link.path}
                          to={link.path as any}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`p-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-colors ${
                            isActive 
                              ? "bg-primary/20 text-primary" 
                              : "text-foreground hover:bg-secondary/60"
                          }`}
                        >
                          {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
                          <span>{link.name}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>

                {/* Secondary Links list */}
                <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
                  <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground font-mono">
                    Community
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    {secondaryLinks.map((link) => (
                      <Link
                        key={link.path}
                        to={link.path as any}
                        onClick={() => setMobileMenuOpen(false)}
                        className="py-2.5 rounded-xl bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary truncate font-semibold"
                      >
                        {link.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drawer Bottom / Action Buttons */}
              <div className="space-y-3 pt-6 border-t border-border/40">
                <Link
                  to="/app/auth"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3.5 rounded-xl text-center font-black bg-primary text-primary-foreground shadow-lg flex items-center justify-center gap-2 active:scale-95"
                >
                  <UserPlus className="h-4.5 w-4.5" />
                  <span>Create Free Account</span>
                </Link>
                
                <Link
                  to="/app/auth"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3.5 rounded-xl text-center font-bold bg-secondary text-foreground hover:bg-accent border border-border/50 flex items-center justify-center gap-2 active:scale-95"
                >
                  <LogIn className="h-4.5 w-4.5 text-primary" />
                  <span>Sign In to App</span>
                </Link>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Body Content */}
      <main className="flex-1 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border/60 bg-card/60 backdrop-blur-lg mt-16 pt-16 pb-12 text-muted-foreground shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-border/40">
            {/* Column 1: Brand */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <img src="/icons/icon-256.webp" alt="Jackpot Jungle" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
                <span className="font-extrabold text-2xl tracking-tight text-foreground">Jackpot Jungle</span>
              </div>
              <p className="text-sm leading-relaxed max-w-sm">
                The next-generation social gaming platform. Chat in real time, build your network, participate in tournaments, and claim daily rewards seamlessly.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  <ShieldCheck className="h-3.5 w-3.5" /> 100% Verified Platform
                </span>
              </div>
            </div>

            {/* Column 2: Navigation */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Navigation</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/" className="hover:text-primary transition-colors">Home</Link></li>
                <li><Link to="/download" className="hover:text-primary transition-colors">Download App</Link></li>
                <li><Link to="/vip" className="hover:text-primary transition-colors">VIP Club</Link></li>
                <li><Link to="/rewards" className="hover:text-primary transition-colors">Rewards Program</Link></li>
                <li><Link to="/promotions" className="hover:text-primary transition-colors">Promotions</Link></li>
                <li><Link to="/leaderboard" className="hover:text-primary transition-colors">Leaderboard</Link></li>
              </ul>
            </div>

            {/* Column 3: Community & Support */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Community</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/referrals" className="hover:text-primary transition-colors">Referral Program</Link></li>
                <li><Link to="/blog" className="hover:text-primary transition-colors">Latest News & Blog</Link></li>
                <li><Link to="/support" className="hover:text-primary transition-colors">Customer Support</Link></li>
                <li><Link to="/faq" className="hover:text-primary transition-colors">FAQ & Guides</Link></li>
              </ul>
            </div>

            {/* Column 4: Legal & App */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Legal & Access</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-primary transition-colors">Terms & Conditions</Link></li>
                <li><Link to="/app/auth" className="hover:text-primary transition-colors font-semibold text-primary">Web Messenger Login</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-center sm:text-left">
            <p>&copy; {new Date().getFullYear()} Jackpot Jungle. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link to="/support" className="hover:text-foreground transition-colors">Support</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
