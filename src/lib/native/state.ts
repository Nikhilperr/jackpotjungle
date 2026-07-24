import { isNative, getSafePlugin } from "./utils";
import { NetworkManager } from "@/lib/network-manager";

const AppStub = {
  addListener: (event: string, callback: any) => {
    return Promise.resolve({ remove: () => {} });
  }
};

const App = getSafePlugin("App", AppStub);

const LAST_ROUTE_KEY = "chancerealm_last_route";

export function initLifecycleMonitoring(router: any) {
  // 1. Continuous route caching for session recovery (works on both Web & Native)
  router.subscribe((state: any) => {
    const path = state.location.pathname;
    // Don't restore auth pages or root redirects
    if (path && !path.includes("/auth") && !path.includes("/reset-password") && path !== "/") {
      localStorage.setItem(LAST_ROUTE_KEY, path);
    }
  });

  if (!isNative()) return;

  // 2. Listen for background/foreground lifecycle events
  App.addListener("appStateChange", (state: { isActive: boolean }) => {
    console.log(`[NativeBridge] App state changed. Active: ${state.isActive}`);
    if (state.isActive) {
      // Drain offline outbox, then ask open screens to catch up (inbox/thread).
      void NetworkManager.processQueues().catch(() => {});
      try {
        window.dispatchEvent(new CustomEvent("jj-app-foreground"));
      } catch {
        /* ignore */
      }
    }
  });

  // 3. Listen for deep link URL events
  App.addListener("appUrlOpen", (data: { url: string }) => {
    console.log("[NativeBridge] App opened with URL:", data.url);
    try {
      // Examples:
      //   app.lovable.jackpotjungle://app/recover?email=x&code=123456
      //   app.lovable.jackpotjungle:///app/recover?email=x&code=123456
      //   app.lovable.jackpotjungle://auth-callback#access_token=...
      const raw = data.url;
      const parsedUrl = new URL(raw.includes("://") ? raw : `app:///${raw}`);
      let path = parsedUrl.pathname || "";
      const host = parsedUrl.hostname || "";
      // Custom schemes often put first segment in hostname: scheme://app/recover → host=app path=/recover
      if (host && host !== "localhost" && !host.includes(".")) {
        path = `/${host}${path.startsWith("/") ? path : `/${path}`}`.replace(/\/+/g, "/");
      }
      const search = parsedUrl.search || "";
      const hash = parsedUrl.hash || "";

      let relativePath = path || "/";
      if (!relativePath.startsWith("/")) relativePath = `/${relativePath}`;
      if (relativePath.includes("auth-callback")) {
        relativePath = "/app/auth-callback";
      }
      if (relativePath === "/recover" || relativePath.endsWith("/recover")) {
        relativePath = "/app/recover";
      }
      if (!relativePath.startsWith("/app/") && relativePath !== "/") {
        // Keep absolute app routes; otherwise prefix
        if (["/auth", "/forgot-password", "/reset-password", "/verify-otp"].some((p) => relativePath.startsWith(p))) {
          relativePath = `/app${relativePath}`;
        }
      }

      console.log(`[NativeBridge] Navigating to deep link route: ${relativePath}${search}${hash}`);
      router.navigate({ to: `${relativePath}${search}${hash}`, replace: true });
    } catch (e) {
      console.error("[NativeBridge] Failed to parse appUrlOpen URL:", e);
    }
  });
}
