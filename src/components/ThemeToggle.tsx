import { useEffect, useState } from "react";
import { Moon, Sun, Sparkles, Zap } from "lucide-react";

function getInitialTheme(): "dark" | "light" | "jackpot" | "amoled" {
  if (typeof window === "undefined") return "jackpot";
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light" || stored === "jackpot" || stored === "amoled") {
    return stored;
  }
  return "jackpot";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light" | "jackpot" | "amoled">("jackpot");

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  function applyTheme(t: "dark" | "light" | "jackpot" | "amoled") {
    const root = document.documentElement;
    root.classList.toggle("dark", t === "dark");
    root.classList.toggle("light", t === "light");
    root.classList.toggle("jackpot", t === "jackpot");
    root.classList.toggle("amoled", t === "amoled");
  }

  function toggle() {
    let next: "dark" | "light" | "jackpot" | "amoled";
    if (theme === "jackpot") {
      next = "dark";
    } else if (theme === "dark") {
      next = "light";
    } else if (theme === "light") {
      next = "amoled";
    } else {
      next = "jackpot";
    }
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme mode"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-accent transition-colors ${className}`}
    >
      {theme === "jackpot" ? (
        <Sparkles className="h-4 w-4 text-orange-500" />
      ) : theme === "dark" ? (
        <Moon className="h-4 w-4 text-blue-400" />
      ) : theme === "light" ? (
        <Sun className="h-4 w-4 text-yellow-500" />
      ) : (
        <Zap className="h-4 w-4 text-indigo-400 animate-pulse" />
      )}
    </button>
  );
}
