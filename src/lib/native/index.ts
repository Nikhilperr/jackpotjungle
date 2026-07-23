import { isNative, getSafePlugin } from "./utils";
import { initBackButtonHandler } from "./navigation";
import { initNetworkMonitoring } from "./network";
import { initLifecycleMonitoring } from "./state";
import { initViewportHeightLock } from "./viewport-height";
import { localDbWarm } from "@/lib/local-db";
export { registerBackAction } from "./navigation";
export { isNative } from "./utils";
export { runAfterFirstPaint } from "./defer";

let isInitialized = false;

async function hideNativeSplash() {
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 100 });
  } catch {
    const SplashScreen = getSafePlugin("SplashScreen", {
      hide: () => Promise.resolve(),
    });
    await SplashScreen.hide().catch(() => {});
  }
}

export function initializeNativeBridge(router: any) {
  if (!isNative()) return;

  if (isInitialized) return;
  isInitialized = true;

  try {
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
