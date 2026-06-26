import { isNative, getSafePlugin } from "./utils";

const AppStub = {
  addListener: (event: string, callback: any) => {
    return Promise.resolve({ remove: () => {} });
  }
};

const App = getSafePlugin("App", AppStub);

const LAST_ROUTE_KEY = "chancerealm_last_route";

export function initLifecycleMonitoring(router: any) {
  if (!isNative()) return;

  // 1. Listen for background/foreground lifecycle events
  App.addListener("appStateChange", (state: { isActive: boolean }) => {
    console.log(`[NativeBridge] App state changed. Active: ${state.isActive}`);
    // The standard document visibility listener in usePresence will automatically
    // pick up the webview visibility toggle, but we can log or trigger custom checks here.
  });

  // 2. Continuous route caching for session recovery
  router.subscribe((state: any) => {
    const path = state.location.pathname;
    // Don't restore auth pages or root redirects
    if (path && !path.startsWith("/auth") && path !== "/") {
      localStorage.setItem(LAST_ROUTE_KEY, path);
    }
  });

  // 3. Attempt to restore last route on cold boot
  restoreSessionRoute(router);
}

function restoreSessionRoute(router: any) {
  try {
    const lastRoute = localStorage.getItem(LAST_ROUTE_KEY);
    if (lastRoute && router.state.location.pathname === "/") {
      console.log(`[NativeBridge] Restoring last active route: ${lastRoute}`);
      router.navigate({ to: lastRoute, replace: true });
    }
  } catch (error) {
    console.error("[NativeBridge] Failed to restore session route:", error);
  }
}
