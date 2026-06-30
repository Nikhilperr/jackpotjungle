import { ReactNode } from "react";
import { motion } from "framer-motion";

interface AuthCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function AuthCard({ children, className = "", delay = 0 }: AuthCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
      transition={{ 
        type: "spring", 
        stiffness: 140, 
        damping: 24, 
        mass: 1.1,
        delay 
      }}
      className={`w-full bg-card/75 backdrop-blur-md border border-border/60 rounded-3xl p-6 md:p-8 shadow-2xl shadow-black/10 hover:shadow-black/15 transition-all duration-300 ${className}`}
    >
      {children}
    </motion.div>
  );
}
