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

  // 2. Listen for deep link URL events
  App.addListener("appUrlOpen", (data: { url: string }) => {
    console.log("[NativeBridge] App opened with URL:", data.url);
    try {
      // The url will look like: "app.lovable.jackpotjungle://auth-callback?code=..."
      // We extract the path and route params to pass to the router
      const parsedUrl = new URL(data.url);
      const path = parsedUrl.pathname;
      const search = parsedUrl.search;
      const hash = parsedUrl.hash;

      let relativePath = path;
      if (!relativePath.startsWith("/")) {
        relativePath = "/" + relativePath;
      }
      if (relativePath.includes("auth-callback")) {
        relativePath = "/app/auth-callback";
      }

      console.log(`[NativeBridge] Navigating to deep link route: ${relativePath}${search}${hash}`);
      router.navigate({ to: `${relativePath}${search}${hash}`, replace: true });
    } catch (e) {
      console.error("[NativeBridge] Failed to parse appUrlOpen URL:", e);
    }
  });

  // 3. Continuous route caching for session recovery
  router.subscribe((state: any) => {
    const path = state.location.pathname;
    // Don't restore auth pages or root redirects
    if (path && !path.includes("/auth") && !path.includes("/reset-password") && path !== "/") {
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
