import { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function AuthButton({
  children,
  busy,
  disabled,
  variant = "primary",
  className = "",
  ...props
}: AuthButtonProps) {
  const getStyles = () => {
    switch (variant) {
      case "secondary":
        return "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/40";
      case "ghost":
        return "bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/40";
      case "danger":
        return "bg-red-600 text-white hover:bg-red-600/90 shadow-lg shadow-red-600/10";
      case "primary":
      default:
        return "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/10";
    }
  };

  const { type = "button", ...rest } = props;

  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={`relative h-12 w-full flex items-center justify-center rounded-2xl text-sm font-semibold select-none transition-colors focus:outline-none focus:ring-2 focus:ring-primary/45 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${getStyles()} ${className}`}
      {...rest}
    >
      {busy ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-current" />
          <span>Sending…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
