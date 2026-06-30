import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
  mode?: "welcome" | "login" | "signup";
  setMode?: (mode: "welcome" | "login" | "signup") => void;
  hideHeader?: boolean;
}

export function AuthLayout({ children, mode = "login", setMode, hideHeader = false }: AuthLayoutProps) {
  const isWelcome = mode === "welcome";

  // Hardware-accelerated physics spring for buttery smooth 120Hz/60Hz viewport animations
  const springTransition = {
    type: "spring",
    stiffness: 140, // Elegant, deliberate movement
    damping: 24,    // Clean dampening with no janky overshoot
    mass: 1.1       // Real physics weight
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-background px-4 py-8 overflow-y-auto transition-colors duration-500">
      {/* Background Animated Gradient Mesh/Circles */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <motion.div
          animate={{
            x: [0, 40, -20, 0],
            y: [0, -50, 30, 0],
            scale: [1, 1.2, 0.9, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[80px]"
        />
        <motion.div
          animate={{
            x: [0, -30, 50, 0],
            y: [0, 40, -40, 0],
            scale: [1, 0.8, 1.15, 1],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] rounded-full bg-accent/10 blur-[100px]"
        />
      </div>

      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle className="shadow-lg border border-border/30" />
      </div>

      {/* Auth Content Card - Desktop split screen layout */}
      <motion.div 
        initial={{ opacity: 0, filter: "blur(12px)", scale: 0.98 }}
        animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-sm lg:max-w-4xl z-10 flex flex-col lg:flex-row bg-card/75 backdrop-blur-md border border-border/60 rounded-[32px] overflow-hidden shadow-2xl transition-all duration-300"
      >
        {/* Left Branded Panel (Desktop Only) - Matching user reference image */}
        {!hideHeader && (
          <div className="w-1/2 bg-gradient-to-br from-primary via-primary/95 to-accent text-primary-foreground p-12 hidden lg:flex flex-col items-center justify-center text-center relative overflow-hidden rounded-r-[60px] shadow-[8px_0_24px_rgba(0,0,0,0.15)] select-none">
            {/* Logo/Icon */}
            <div className="relative inline-flex items-center justify-center mb-6">
              <motion.div
                animate={{ 
                  scale: [1, 1.08, 1],
                  opacity: [0.15, 0.3, 0.15]
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -inset-4 rounded-3xl bg-white/20 blur-md pointer-events-none"
              />
              <img 
                src="/icons/icon-256.webp" 
                alt="Logo" 
                className="relative h-24 w-24 rounded-3xl shadow-2xl object-cover border border-white/20 bg-background"
              />
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-1.5">
              Jackpot Jungle
              <Sparkles className="h-5.5 w-5.5 text-white animate-pulse" />
            </h1>
            <p className="text-xs text-white/80 font-medium tracking-wide uppercase mt-1">
              Messenger
            </p>

            {/* Split Screen Dynamic Text based on auth state */}
            <div className="mt-12 space-y-4 max-w-[280px] min-h-[140px] flex flex-col items-center justify-center">
              {mode === "login" ? (
                <>
                  <h2 className="text-2xl font-bold text-white">Hello Friend!</h2>
                  <p className="text-xs text-white/70 leading-relaxed">
                    Register your account details and start your journey with the Jackpot Jungle community.
                  </p>
                  {setMode && (
                    <button
                      onClick={() => setMode("signup")}
                      className="mt-4 border-2 border-white hover:bg-white hover:text-primary text-white font-bold px-8 py-2.5 rounded-full text-xs uppercase tracking-wider transition-all duration-300 active:scale-95"
                    >
                      Sign Up
                    </button>
                  )}
                </>
              ) : mode === "signup" ? (
                <>
                  <h2 className="text-2xl font-bold text-white">Welcome Back!</h2>
                  <p className="text-xs text-white/70 leading-relaxed">
                    To keep connected with your friends and support hosts, please sign in with your account.
                  </p>
                  {setMode && (
                    <button
                      onClick={() => setMode("login")}
                      className="mt-4 border-2 border-white hover:bg-white hover:text-primary text-white font-bold px-8 py-2.5 rounded-full text-xs uppercase tracking-wider transition-all duration-300 active:scale-95"
                    >
                      Sign In
                    </button>
                  )}
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-white">Welcome!</h2>
                  <p className="text-xs text-white/70 leading-relaxed">
                    Connect instantly with friends, admins, and support teams. Explore our fast, modern messenger.
                  </p>
                  {setMode && (
                    <button
                      onClick={() => setMode("login")}
                      className="mt-4 border-2 border-white hover:bg-white hover:text-primary text-white font-bold px-8 py-2.5 rounded-full text-xs uppercase tracking-wider transition-all duration-300 active:scale-95"
                    >
                      Get Started
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Right Form Area (Desktop) / Main Content Area (Mobile) */}
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 md:p-12 relative">
          {/* Mobile Header Brand (Hidden on Desktop) */}
          {!hideHeader && (
            <div className="text-center select-none flex flex-col items-center mb-6 lg:hidden">
              <div className="relative inline-flex items-center justify-center">
                <img 
                  src="/icons/icon-256.webp" 
                  alt="Logo" 
                  className="relative h-16 w-16 rounded-2xl shadow-md object-cover border border-border/20 bg-card"
                />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center justify-center gap-1 mt-2.5">
                Jackpot Jungle
                <Sparkles className="h-4.5 w-4.5 text-primary animate-pulse" />
              </h1>
              <p className="text-xs text-muted-foreground font-medium tracking-wide mt-0.5">
                Messenger
              </p>
            </div>
          )}

          {/* Children Forms */}
          <div className="w-full flex flex-col items-center">
            {children}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
