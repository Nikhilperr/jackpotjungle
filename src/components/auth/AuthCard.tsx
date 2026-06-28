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
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`w-full bg-card/75 backdrop-blur-md border border-border/60 rounded-3xl p-6 md:p-8 shadow-2xl shadow-black/10 hover:shadow-black/15 transition-all duration-300 ${className}`}
    >
      {children}
    </motion.div>
  );
}
