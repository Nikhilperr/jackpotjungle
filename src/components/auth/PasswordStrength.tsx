import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

interface PasswordStrengthProps {
  value: string;
}

export function PasswordStrength({ value }: PasswordStrengthProps) {
  const rules = useMemo(() => {
    return {
      length: value.length >= 6,
      number: /\d/.test(value),
      uppercase: /[A-Z]/.test(value),
      special: /[^A-Za-z0-9]/.test(value),
    };
  }, [value]);

  const strength = useMemo(() => {
    if (!value) return 0;
    let score = 0;
    if (rules.length) score += 1;
    if (rules.number) score += 1;
    if (rules.uppercase) score += 1;
    if (rules.special) score += 1;
    return score; // 0 to 4
  }, [value, rules]);

  const strengthLabel = useMemo(() => {
    if (strength === 0) return "";
    if (strength <= 1) return "Weak";
    if (strength <= 3) return "Medium";
    return "Strong";
  }, [strength]);

  const getStrengthColor = () => {
    if (strength <= 1) return "bg-red-500";
    if (strength <= 3) return "bg-amber-500";
    return "bg-green-500";
  };

  return (
    <div className="space-y-3 px-1 text-xs">
      {/* Strength Meter Bar */}
      {value && (
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-bold uppercase text-muted-foreground">
            <span>Password Strength</span>
            <span className={strength <= 1 ? "text-red-500" : strength <= 3 ? "text-amber-500" : "text-green-500"}>
              {strengthLabel}
            </span>
          </div>
          <div className="h-1.5 w-full bg-secondary/60 rounded-full overflow-hidden flex gap-1">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(strength / 4) * 100}%` }}
              className={`h-full rounded-full transition-all duration-300 ${getStrengthColor()}`}
            />
          </div>
        </div>
      )}

      {/* Rules Checklist */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 text-[11px] text-muted-foreground select-none">
        <CheckItem met={rules.length} label="At least 6 characters" />
        <CheckItem met={rules.number} label="At least 1 number" />
        <CheckItem met={rules.uppercase} label="1 uppercase letter" />
        <CheckItem met={rules.special} label="1 special character" />
      </div>
    </div>
  );
}

function CheckItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 transition-colors duration-200">
      <div className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 border ${met ? "bg-green-500/10 border-green-500/30 text-green-500" : "border-border/60 text-muted-foreground/40"}`}>
        {met ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : <X className="h-2 w-2 stroke-[3]" />}
      </div>
      <span className={met ? "text-foreground font-medium" : "text-muted-foreground/70"}>
        {label}
      </span>
    </div>
  );
}
