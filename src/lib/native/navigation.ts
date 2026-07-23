import { isNative, getSafePlugin } from "./utils";
import { toast } from "sonner";

interface BackAction {
  handler: () => boolean | Promise<boolean>;
  priority: number;
}

const backActions: BackAction[] = [];
let exitTimer: number | null = null;
let lastBackTime = 0;

// Stub implementation for App plugin
const AppStub = {
  exitApp: () => Promise.resolve(),
  addListener: (event: string, callback: any) => {
    return Promise.resolve({ remove: () => {} });
  }
};

const App = getSafePlugin("App", AppStub);

/**
 * Registers a back action handler with a given priority.
 * Handlers should return `true` if they consumed the back action, or `false` to propagate.
 * Returns an unregister function.
 */
export function registerBackAction(handler: () => boolean | Promise<boolean>, priority: number): () => void {
  const item = { handler, priority };
  backActions.push(item);
  // Sort descending by priority so higher priorities run first
  backActions.sort((a, b) => b.priority - a.priority);

  return () => {
    const index = backActions.indexOf(item);
    if (index !== -1) {
      backActions.splice(index, 1);
    }
  };
}

/**
 * Initialize back button event handling on Android
 */
export function initBackButtonHandler(router: any) {
  if (!isNative()) return;

  App.addListener("backButton", async () => {
    const now = Date.now();
    if (now - lastBackTime < 500) {
      console.log("[BackButton] Debouncing rapid double-swipe back gesture.");
      return;
    }
    lastBackTime = now;
    // 1. Run through registered back actions (dialogs, media viewers, overlay states, etc.)
    for (const action of backActions) {
      const consumed = await action.handler();
      if (consumed) {
        return;
      }
    }

    // 2. Check TanStack Router route state. If nested, navigate back.
    const currentPath = router.state.location.pathname;
    
    if (
      currentPath.startsWith("/app/friends") || 
      currentPath.startsWith("/app/profile") || 
      currentPath.startsWith("/friends") || 
      currentPath.startsWith("/profile") ||
      (currentPath.startsWith("/app/chat/") && currentPath !== "/app/chat")
    ) {
      router.navigate({ to: "/app/chat" });
      return;
    }

    const isRootRoute = ["/", "/chat", "/app/chat", "/auth", "/app/auth"].includes(currentPath);

    if (!isRootRoute) {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.history.back();
      } else {
        router.navigate({ to: "/app/chat" });
      }
      return;
    }

    // 3. Root route double back to exit
    if (exitTimer) {
      clearTimeout(exitTimer);
      exitTimer = null;
      App.exitApp();
    } else {
      toast("Press back again to exit", {
        duration: 2000,
        position: "bottom-center",
      });
      exitTimer = window.setTimeout(() => {
        exitTimer = null;
      }, 2000) as unknown as number;
    }
  });
}
