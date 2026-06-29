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
  HelpCircle, 
  MessageSquare, 
  FileText, 
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
      <div className="bg-gradient-to-r from-amber-500 via-primary to-purple-600 text-white text-xs py-2 px-4 text-center font-bold flex items-center justify-center gap-2 shadow-inner">
        <Sparkles className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "6s" }} />
        <span>🎰 Welcome to Jackpot Jungle Social Casino! Claim your daily free coins & VIP bonuses today!</span>
        <Link to="/rewards" className="underline font-black hover:opacity-90 ml-1 inline-flex items-center gap-0.5">
          Claim Free Chips <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Main Navigation Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Logo Brand */}
          <Link to="/" className="flex items-center gap-3 group shrink-0">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-xl bg-primary/30 blur-md group-hover:bg-primary/50 transition-all" />
              <img 
                src="/icons/icon-256.webp" 
                alt="Jackpot Jungle Logo" 
                className="relative h-11 w-11 rounded-xl object-cover border border-border/40 shadow-md group-hover:scale-105 transition-transform" 
              />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xl tracking-tight leading-none bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text">
                Jackpot Jungle
              </span>
              <span className="text-[10px] font-bold tracking-widest uppercase text-primary mt-1">
                Messenger & Gaming
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              const Icon = link.icon;
              return (
                <Link
                  key={link.path}
                  to={link.path as any}
                  className={`px-3 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                    isActive 
                      ? "bg-primary/15 text-primary font-semibold" 
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {Icon && <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />}
                  <span>{link.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Desktop Right Actions & Theme Toggle */}
          <div className="hidden sm:flex items-center gap-3">
            <ThemeToggle className="shadow-sm border border-border/40" />
            
            <Link
              to="/app/auth"
              className="px-4 py-2 rounded-full text-sm font-semibold text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 border border-border/50"
            >
              <LogIn className="h-4 w-4 text-primary" />
              <span>Login</span>
            </Link>

            <Link
              to="/app/auth"
              className="px-5 py-2.5 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg hover:shadow-primary/25 flex items-center gap-1.5 active:scale-95"
            >
              <UserPlus className="h-4 w-4" />
              <span>Register</span>
            </Link>
          </div>

          {/* Mobile Menu Button & Theme Toggle */}
          <div className="flex items-center gap-2 sm:hidden">
            <ThemeToggle className="shadow-sm border border-border/40" />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-secondary text-foreground hover:bg-accent transition-colors"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden border-b border-border/60 bg-background/95 backdrop-blur-2xl overflow-hidden"
            >
              <div className="px-4 pt-3 pb-6 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {navLinks.map((link) => {
                    const isActive = location.pathname === link.path;
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.path}
                        to={link.path as any}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`p-3 rounded-xl text-sm font-semibold flex items-center gap-2.5 transition-colors ${
                          isActive 
                            ? "bg-primary/20 text-primary" 
                            : "bg-secondary/40 text-foreground hover:bg-secondary"
                        }`}
                      >
                        {Icon && <Icon className="h-4 w-4 text-primary" />}
                        <span>{link.name}</span>
                      </Link>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-border/40 grid grid-cols-3 gap-2 text-center text-xs">
                  {secondaryLinks.map((link) => (
                    <Link
                      key={link.path}
                      to={link.path as any}
                      onClick={() => setMobileMenuOpen(false)}
                      className="py-2 px-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/30 truncate"
                    >
                      {link.name}
                    </Link>
                  ))}
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <Link
                    to="/app/auth"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full py-3 rounded-xl text-center font-bold bg-primary text-primary-foreground shadow-md flex items-center justify-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Create Free Account</span>
                  </Link>
                  <Link
                    to="/app/auth"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full py-3 rounded-xl text-center font-semibold bg-secondary text-foreground hover:bg-accent border border-border/50 flex items-center justify-center gap-2"
                  >
                    <LogIn className="h-4 w-4 text-primary" />
                    <span>Sign In to App</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Body Content */}
      <main className="flex-1 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border/60 bg-card/60 backdrop-blur-lg mt-16 pt-16 pb-12 text-muted-foreground">
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
