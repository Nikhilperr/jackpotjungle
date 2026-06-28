import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
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
        {/* Header App Brand */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center mb-8 select-none"
        >
          <div className="relative inline-flex items-center justify-center mb-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-primary to-accent opacity-20 blur-md"
            />
            <img 
              src="/icons/icon-256.webp" 
              alt="Logo" 
              className="relative h-20 w-20 rounded-2xl shadow-xl object-cover border border-border/20"
            />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center justify-center gap-1.5">
            Jackpot Jungle
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          </h1>
          <p className="text-sm text-muted-foreground font-medium mt-1">Messenger</p>
        </motion.div>

        {children}
      </div>
    </div>
  );
}
