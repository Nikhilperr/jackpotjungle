import { useEffect, useState } from "react";
import { Moon, Sun, Sparkles, Zap, Layers } from "lucide-react";
import {
  applyAppTheme,
  getInitialTheme,
  type AppThemeName,
} from "@/lib/app-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<AppThemeName>("amoled");

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyAppTheme(t);
  }, []);

  function toggle() {
    let next: AppThemeName;
    if (theme === "amoled") {
      next = "light";
    } else if (theme === "light") {
      next = "jackpot";
    } else if (theme === "jackpot") {
      next = "dark";
    } else if (theme === "dark") {
      next = "glass";
    } else {
      next = "amoled";
    }
    setTheme(next);
    localStorage.setItem("theme", next);
    applyAppTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme mode"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-accent transition-colors ${className}`}
    >
      {theme === "amoled" ? (
        <Zap className="h-4 w-4 text-indigo-400 animate-pulse" />
      ) : theme === "jackpot" ? (
        <Sparkles className="h-4 w-4 text-orange-500" />
      ) : theme === "dark" ? (
        <Moon className="h-4 w-4 text-blue-400" />
      ) : theme === "glass" ? (
        <Layers className="h-4 w-4 text-cyan-400" />
      ) : (
        <Sun className="h-4 w-4 text-yellow-500" />
      )}
    </button>
  );
}
