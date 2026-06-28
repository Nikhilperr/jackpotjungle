import React, { useState, InputHTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  label?: string;
  error?: string;
}

export const AuthInput = React.forwardRef<HTMLInputElement, AuthInputProps>(
  ({ icon, label, error, type = "text", className = "", ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [capsLockActive, setCapsLockActive] = useState(false);
    const isPassword = type === "password";
    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const isCaps = e.getModifierState("CapsLock");
      setCapsLockActive(isCaps);
    };

    return (
      <div className="space-y-1.5 w-full relative">
        {label && (
          <label className="text-xs font-semibold text-muted-foreground ml-1.5 select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-4 text-muted-foreground/60 transition-colors pointer-events-none group-focus-within:text-primary">
              {icon}
            </div>
          )}
          <Input
            ref={ref}
            type={inputType}
            className={`h-12 w-full ${icon ? "pl-11" : "pl-4"} ${isPassword ? "pr-11" : "pr-4"} rounded-2xl border border-border/80 bg-background/50 hover:bg-background/80 focus:bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 text-sm placeholder:text-muted-foreground/50 ${className}`}
            onKeyUp={handleKeyUp}
            onKeyDown={handleKeyUp}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 text-muted-foreground/60 hover:text-foreground transition-colors p-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={showPassword ? "eye" : "eye-off"}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </motion.div>
              </AnimatePresence>
            </button>
          )}
        </div>

        {/* Caps Lock Alert Banner */}
        <AnimatePresence>
          {isPassword && capsLockActive && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -5 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -5 }}
              className="flex items-center gap-1.5 text-[11px] text-amber-500 font-semibold px-2 overflow-hidden"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Caps Lock is ON</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0, y: -5 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -5 }}
              className="text-xs text-destructive font-medium px-2 overflow-hidden"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

AuthInput.displayName = "AuthInput";
