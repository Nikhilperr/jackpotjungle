import React, { useState, InputHTMLAttributes } from "react";
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

    const isPassword = type === "password";
    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div className="space-y-1.5 w-full relative">
        {label && (
          <label className="text-xs font-semibold text-muted-foreground ml-1.5">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-4 text-muted-foreground/60 pointer-events-none">
              {icon}
            </div>
          )}
          <Input
            ref={ref}
            type={inputType}
            className={`h-12 w-full ${icon ? "pl-11" : "pl-4"} ${isPassword ? "pr-11" : "pr-4"} rounded-2xl border border-border/80 bg-background/50 focus:bg-background focus:border-primary text-sm placeholder:text-muted-foreground/50 ${className}`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 text-muted-foreground/60 hover:text-foreground p-1 rounded-lg focus:outline-none"
            >
              {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-xs text-destructive font-medium px-2">
            {error}
          </p>
        )}
      </div>
    );
  }
);

AuthInput.displayName = "AuthInput";
