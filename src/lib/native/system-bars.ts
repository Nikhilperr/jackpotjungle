import { Capacitor } from "@capacitor/core";

export type AppThemeName = "dark" | "light" | "jackpot" | "amoled" | "glass";

/** Light status/nav icons (white clock/battery) for dark chrome; dark icons for light chrome. */
export function themeUsesLightSystemIcons(theme: AppThemeName): boolean {
  return theme === "light" || theme === "jackpot" || theme === "glass";
}

export function themeSystemBarColor(theme: AppThemeName): string {
  if (theme === "amoled") return "#000000";
  if (theme === "dark") return "#121212";
  return "#ffffff";
}

/**
 * Match Android status/nav bar colors + icon contrast to the in-app theme
 * so clock/battery stay readable (native app feel, not inverted web chrome).
 */
export function syncNativeSystemBars(theme: AppThemeName): void {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;

  const lightIcons = themeUsesLightSystemIcons(theme);
  const color = themeSystemBarColor(theme);

  try {
    document.documentElement.style.colorScheme = lightIcons ? "light" : "dark";
  } catch {
    /* ignore */
  }

  const bridge = (window as any).AndroidBridge;
  if (bridge?.setSystemBars) {
    try {
      // lightIcons=true → dark (black) clock/battery for light backgrounds
      bridge.setSystemBars(lightIcons, color);
    } catch (e) {
      console.warn("[system-bars] AndroidBridge.setSystemBars failed:", e);
    }
  }
}
