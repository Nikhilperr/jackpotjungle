import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
  mode?: "welcome" | "login" | "signup";
  hideHeader?: boolean;
}

export function AuthLayout({ children, mode = "login", hideHeader = false }: AuthLayoutProps) {
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

      {/* Auth Content Wrapper - Animates in smoothly on page load to prevent popping */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-sm z-10 flex flex-col items-center py-4"
      >
        {/* Header App Brand - GPU accelerated scale movements (bypasses y-coordinate overlap) */}
        {!hideHeader && (
          <motion.div 
            animate={{
              scale: isWelcome ? 1.15 : 0.82,
            }}
            transition={springTransition}
            className={`text-center select-none flex flex-col items-center origin-center z-10 transition-all duration-500 ${
              isWelcome ? "mb-10 mt-4" : "mb-6 mt-0"
            }`}
          >
            <div className="relative inline-flex items-center justify-center">
              {/* Glow ring */}
              <motion.div
                animate={{ 
                  scale: isWelcome ? [1, 1.1, 1] : [1, 1.05, 1],
                  opacity: isWelcome ? [0.15, 0.35, 0.15] : [0.05, 0.15, 0.05]
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-primary to-accent blur-md pointer-events-none"
              />
              <img 
                src="/icons/icon-256.webp" 
                alt="Logo" 
                className="relative h-24 w-24 rounded-3xl shadow-xl object-cover border border-border/20 bg-card"
              />
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center justify-center gap-1.5 mt-4">
              Jackpot Jungle
              <Sparkles className="h-5.5 w-5.5 text-primary animate-pulse" />
            </h1>
            <p className="text-sm text-muted-foreground font-medium tracking-wide mt-1">
              Messenger
            </p>
          </motion.div>
        )}

        {/* Form area */}
        <div className="w-full flex flex-col items-center">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
