import { isNative, getSafePlugin } from "./utils";
import { initBackButtonHandler } from "./navigation";
import { initNetworkMonitoring } from "./network";
import { initLifecycleMonitoring } from "./state";
export { registerBackAction } from "./navigation";
export { isNative } from "./utils";

// Stub implementation for SplashScreen plugin
const SplashScreenStub = {
  hide: () => Promise.resolve()
};

const SplashScreen = getSafePlugin("SplashScreen", SplashScreenStub);

/**
 * Initializes all native-specific bridge services when running inside
 * the Android/iOS Capacitor wrapper.
 */
export function initializeNativeBridge(router: any) {
  if (!isNative()) {
    return;
  }

  console.log("[NativeBridge] Initializing native integration layer...");

  try {
    // 1. Initialize Network Monitor
    initNetworkMonitoring(router);

    // 2. Initialize Android physical Back Button listener
    initBackButtonHandler(router);

    // 3. Initialize App state lifecycle hooks (Presence and Route Cache)
    initLifecycleMonitoring(router);

    // 4. Programmatically dismiss the native splash screen now that app is mounted & running
    setTimeout(() => {
      SplashScreen.hide()
        .then(() => console.log("[NativeBridge] SplashScreen dismissed successfully."))
        .catch((err) => console.warn("[NativeBridge] SplashScreen hide failed:", err));
    }, 500); // 500ms grace period for initial rendering to settle
  } catch (error) {
    console.error("[NativeBridge] Critical error during bridge initialization:", error);
  }
}
