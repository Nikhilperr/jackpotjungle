import { useEffect, useState } from "react";
import { Moon, Sun, Sparkles, Zap, Layers } from "lucide-react";

function getInitialTheme(): "dark" | "light" | "jackpot" | "amoled" | "glass" {
  if (typeof window === "undefined") return "amoled";
  // One-time migrate product default jackpot → amoled black
  try {
    if (localStorage.getItem("jj_theme_default_v2") !== "1") {
      const prev = localStorage.getItem("theme");
      if (!prev || prev === "jackpot") localStorage.setItem("theme", "amoled");
      localStorage.setItem("jj_theme_default_v2", "1");
    }
  } catch {
    /* ignore */
  }
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light" || stored === "jackpot" || stored === "amoled" || stored === "glass") {
    return stored;
  }
  return "amoled";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light" | "jackpot" | "amoled" | "glass">("amoled");

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  function applyTheme(t: "dark" | "light" | "jackpot" | "amoled" | "glass") {
    const root = document.documentElement;
    root.classList.toggle("dark", t === "dark");
    root.classList.toggle("light", t === "light");
    root.classList.toggle("jackpot", t === "jackpot");
    root.classList.toggle("amoled", t === "amoled");
    root.classList.toggle("glass", t === "glass");
    const shellBg = t === "light" || t === "jackpot" || t === "glass" ? "#ffffff" : "#121212";
    root.style.setProperty("--jj-shell-bg", shellBg);
  }

  function toggle() {
    let next: "dark" | "light" | "jackpot" | "amoled" | "glass";
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
    applyTheme(next);
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
