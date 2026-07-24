import {
  syncNativeSystemBars,
  type AppThemeName,
} from "@/lib/native/system-bars";

export type { AppThemeName };

export function getInitialTheme(): AppThemeName {
  if (typeof window === "undefined") return "amoled";
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
  if (
    stored === "dark" ||
    stored === "light" ||
    stored === "jackpot" ||
    stored === "amoled" ||
    stored === "glass"
  ) {
    return stored;
  }
  return "amoled";
}

export function applyAppTheme(t: AppThemeName) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
  root.classList.toggle("light", t === "light");
  root.classList.toggle("jackpot", t === "jackpot");
  root.classList.toggle("amoled", t === "amoled");
  root.classList.toggle("glass", t === "glass");
  const shellBg =
    t === "light" || t === "jackpot" || t === "glass"
      ? "#ffffff"
      : t === "amoled"
        ? "#000000"
        : "#121212";
  root.style.setProperty("--jj-shell-bg", shellBg);
  syncNativeSystemBars(t);
}

/** Call once on app boot so status icons match theme before chrome paints. */
export function bootstrapAppTheme() {
  if (typeof window === "undefined") return;
  applyAppTheme(getInitialTheme());
}
