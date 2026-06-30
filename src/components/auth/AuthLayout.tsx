import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
  mode: "welcome" | "login" | "signup";
}

export function AuthLayout({ children, mode }: AuthLayoutProps) {
  const isWelcome = mode === "welcome";

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-background px-4 py-8 overflow-hidden transition-colors duration-500">
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
        <motion.div
          animate={{
            scale: [0.8, 1.1, 0.8],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-[35%] left-[25%] w-[30%] h-[30%] rounded-full bg-primary/5 blur-[60px]"
        />
      </div>

      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle className="shadow-lg border border-border/30" />
      </div>

      {/* Auth Content */}
      <div className="relative w-full max-w-md z-10 flex flex-col items-center">
        {/* Header App Brand - Animates dynamically using shared layout animations */}
        <motion.div 
          layout
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className={`text-center select-none flex flex-col items-center ${
            isWelcome ? "mt-6 mb-6" : "mb-8 animate-in fade-in slide-in-from-top duration-300"
          }`}
        >
          <motion.div
            layout
            className="relative inline-flex items-center justify-center"
          >
            {/* Glow ring */}
            <motion.div
              layout
              animate={{ 
                scale: isWelcome ? [1, 1.12, 1] : [1, 1.05, 1],
                opacity: isWelcome ? [0.15, 0.35, 0.15] : [0.05, 0.15, 0.05]
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-primary to-accent blur-md"
            />
            <motion.img 
              layout
              src="/icons/icon-256.webp" 
              alt="Logo" 
              className={`relative rounded-2xl shadow-xl object-cover border border-border/20 bg-card transition-all duration-500 ${
                isWelcome ? "h-28 w-28 rounded-[28px]" : "h-16 w-16"
              }`}
            />
          </motion.div>

          <motion.h1 
            layout
            className={`font-extrabold tracking-tight text-foreground flex items-center justify-center gap-1.5 transition-all duration-500 ${
              isWelcome ? "text-4xl mt-6" : "text-2xl mt-3"
            }`}
          >
            Jackpot Jungle
            <Sparkles className={`text-primary animate-pulse transition-all duration-500 ${
              isWelcome ? "h-6 w-6" : "h-4.5 w-4.5"
            }`} />
          </motion.h1>
          <motion.p 
            layout
            className={`text-muted-foreground font-medium mt-1 transition-all duration-500 ${
              isWelcome ? "text-sm tracking-wide" : "text-xs"
            }`}
          >
            Messenger
          </motion.p>
        </motion.div>

        {children}
      </div>
    </div>
  );
}
