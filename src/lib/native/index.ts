import { isNative, getSafePlugin } from "./utils";
import { initBackButtonHandler } from "./navigation";
import { initNetworkMonitoring } from "./network";
import { initLifecycleMonitoring } from "./state";
import { initViewportHeightLock } from "./viewport-height";
import { localDbWarm } from "@/lib/local-db";
import { bootstrapAppTheme } from "@/lib/app-theme";
export { registerBackAction } from "./navigation";
export { isNative } from "./utils";
export { runAfterFirstPaint } from "./defer";

let isInitialized = false;

async function hideNativeSplash() {
  // Never use a statically analyzable import of @capacitor/splash-screen here —
  // Vite SSR/`npm run build` on the VPS must succeed without bundling native plugins.
  try {
    const pluginName = "SplashScreen";
    const cap = (window as any).Capacitor;
    const nativePlugin = cap?.Plugins?.[pluginName];
    if (nativePlugin?.hide) {
      await nativePlugin.hide({ fadeOutDuration: 100 });
      return;
    }
  } catch {
    /* fall through */
  }

  const SplashScreen = getSafePlugin("SplashScreen", {
    hide: () => Promise.resolve(),
  });
  await SplashScreen.hide({ fadeOutDuration: 100 }).catch(() => {});
}

export function initializeNativeBridge(router: any) {
  if (!isNative()) return;

  if (isInitialized) return;
  isInitialized = true;

  try {
    // Status bar clock/battery contrast must match theme before first paint settles.
    bootstrapAppTheme();
    // Bridge may attach slightly after WebView load — re-sync once more.
    window.setTimeout(() => bootstrapAppTheme(), 400);
    window.setTimeout(() => bootstrapAppTheme(), 1200);

    localDbWarm();
    initViewportHeightLock();
    initNetworkMonitoring(router);
    initBackButtonHandler(router);
    initLifecycleMonitoring(router);

    // Keep Capacitor splash until chats/auth has painted — avoids black gap.
    const hideAfterPaint = () => {
      window.removeEventListener("jj-app-ready", onReady);
      // Wait 2 frames so React chrome is on screen under the splash.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void hideNativeSplash();
        });
      });
    };
    const onReady = () => hideAfterPaint();
    window.addEventListener("jj-app-ready", onReady);
    if ((window as any).__jjAppReadyFired) hideAfterPaint();
    window.setTimeout(onReady, 4000);
  } catch (error) {
    console.error("[NativeBridge] Critical error during bridge initialization:", error);
  }
}
