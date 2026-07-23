import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { registerPushTokenServer } from "@/lib/push-register.functions";
import { runAfterFirstPaint } from "@/lib/native/defer";
import {
  checkPushPermission,
  ensureAndroidNotificationChannels,
  hasSoftAskedPush,
  isNativeApp,
  markSoftAskedPush,
  requestPushPermission,
  toastPermissionDenied,
} from "@/lib/native/permissions";

/** Parse "/app/admin?tab=inbox&c=uuid" into TanStack navigate args (fast + reliable search). */
function navigateFromPushPath(
  navigate: ReturnType<typeof useNavigate>,
  rawPath: string,
) {
  try {
    const url = new URL(rawPath, "https://jj.local");
    const pathname = url.pathname || rawPath;
    const search: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      search[key] = value;
    });
    if (Object.keys(search).length > 0) {
      console.log(`[Push Debug] Navigating to ${pathname}`, search);
      void navigate({ to: pathname as any, search: search as any, replace: false });
      return;
    }
    void navigate({ to: pathname as any, replace: false });
  } catch {
    void navigate({ to: rawPath as any, replace: false });
  }
}

async function registerFcmToken(PushNotifications: any, platform: string) {
  await ensureAndroidNotificationChannels();

  await PushNotifications.addListener("registration", async (token: any) => {
    console.log("[FCM Token]", token.value);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    try {
      const res = await registerPushTokenServer({
        data: {
          userId: u.user.id,
          token: token.value,
          platform,
        },
      });
      console.log("[Push Debug] Server registration response:", res);
    } catch (err) {
      console.error("[Push Debug] Failed to register token via server:", err);
    }
  });

  await PushNotifications.addListener("registrationError", (error: any) => {
    console.error("[Push Debug] Registration error:", error);
  });

  await PushNotifications.register();
  console.log("[Push Debug] register() invoked");
}

/**
 * Request OS notification permission + register FCM (user Settings toggle / explicit user intent).
 * Uses the standard Android dialog — never opens Settings automatically.
 */
export async function enableNativePushFromUserGesture(): Promise<boolean> {
  if (!isNativeApp()) return false;

  const current = await checkPushPermission();
  if (current === "granted") {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const cap = (window as any).Capacitor;
    await registerFcmToken(PushNotifications, cap?.getPlatform?.() ?? "android");
    return true;
  }

  if (current === "denied") {
    // Permanently denied — explain; user must enable in system Settings themselves.
    toastPermissionDenied("notifications");
    return false;
  }

  const next = await requestPushPermission();
  markSoftAskedPush();
  if (next !== "granted") {
    toastPermissionDenied("notifications");
    return false;
  }

  const { PushNotifications } = await import("@capacitor/push-notifications");
  const cap = (window as any).Capacitor;
  await registerFcmToken(PushNotifications, cap?.getPlatform?.() ?? "android");
  return true;
}

/**
 * Native push: tap routing always; permission only after home (soft, once)
 * or when already granted. Never opens Android Settings. Never asks on auth/splash.
 */
export function useNativePush(options?: { softAskNotifications?: boolean }) {
  const navigate = useNavigate();
  const softAsk = options?.softAskNotifications !== false;

  useEffect(() => {
    console.log("[Push Debug] useNativePush mounted");
    let mounted = true;
    let cancelDefer: (() => void) | null = null;
    let softAskTimer: ReturnType<typeof setTimeout> | null = null;
    let actionHandle: { remove: () => Promise<void> } | null = null;
    let registrationHandle: { remove: () => Promise<void> } | null = null;
    let registrationErrorHandle: { remove: () => Promise<void> } | null = null;

    const handleAction = (action: any) => {
      console.log("[Push Debug] Action performed:", action);
      let path = action.notification?.data?.routePath || action.notification?.data?.url;
      if (!path) return;

      const callAction = action.notification?.data?.action;
      const callId = action.notification?.data?.call_id;
      if (callAction && callId) {
        path = path.includes("?")
          ? `${path}&action=${callAction}&call_id=${callId}`
          : `${path}?action=${callAction}&call_id=${callId}`;
      }

      console.log(`[Push Debug] Tapped notification. Redirecting to: ${path}`);
      navigateFromPushPath(navigate, path);
    };

    // Tap listener ASAP — no permission dialog.
    void (async () => {
      const cap = (window as any).Capacitor;
      if (!cap || !mounted) return;
      try {
        const pluginModule = await import("@capacitor/push-notifications");
        const PushNotifications = pluginModule.PushNotifications;
        actionHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          handleAction,
        );
      } catch (err) {
        console.warn("[Push Debug] Early action listener setup failed:", err);
      }
    })();

    cancelDefer = runAfterFirstPaint(() => {
      if (!mounted) return;
      void (async () => {
        if (!isNativeApp()) return;

        const cap = (window as any).Capacitor;
        const waitForBridge = () =>
          new Promise<boolean>((resolve) => {
            const check = () => {
              const c = (window as any).Capacitor;
              return !!(c && c.PluginHeaders && c.PluginHeaders.length > 0);
            };
            if (check()) {
              resolve(true);
              return;
            }
            const poll = setInterval(() => {
              if (check()) {
                clearInterval(poll);
                resolve(true);
              }
            }, 10);
            setTimeout(() => {
              clearInterval(poll);
              resolve(false);
            }, 5000);
          });

        const ok = await waitForBridge();
        if (!ok || !mounted) return;

        const { PushNotifications } = await import("@capacitor/push-notifications");
        if (!actionHandle) {
          actionHandle = await PushNotifications.addListener(
            "pushNotificationActionPerformed",
            handleAction,
          );
        }

        const state = await checkPushPermission();

        // Already granted (returning user) — register quietly, no dialog.
        if (state === "granted") {
          await ensureAndroidNotificationChannels();
          registrationHandle = await PushNotifications.addListener("registration", async (token: any) => {
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) return;
            try {
              await registerPushTokenServer({
                data: {
                  userId: u.user.id,
                  token: token.value,
                  platform: cap?.getPlatform?.() ?? "android",
                },
              });
            } catch (err) {
              console.error("[Push Debug] Failed to register token via server:", err);
            }
          });
          registrationErrorHandle = await PushNotifications.addListener("registrationError", (error: any) => {
            console.error("[Push Debug] Registration error:", error);
          });
          await PushNotifications.register();
          return;
        }

        // Soft ask once after user is already on home — never on splash/auth, never open Settings.
        if (!softAsk || state !== "prompt" || hasSoftAskedPush()) {
          console.log("[Push Debug] Skipping soft notification ask. state=", state);
          return;
        }

        softAskTimer = setTimeout(async () => {
          if (!mounted || hasSoftAskedPush()) return;
          markSoftAskedPush();
          console.log("[Push Debug] Soft-asking notification permission (home, once)");
          const next = await requestPushPermission();
          if (!mounted) return;
          if (next === "granted") {
            await ensureAndroidNotificationChannels();
            registrationHandle = await PushNotifications.addListener("registration", async (token: any) => {
              const { data: u } = await supabase.auth.getUser();
              if (!u.user) return;
              try {
                await registerPushTokenServer({
                  data: {
                    userId: u.user.id,
                    token: token.value,
                    platform: cap?.getPlatform?.() ?? "android",
                  },
                });
              } catch (err) {
                console.error("[Push Debug] Failed to register token via server:", err);
              }
            });
            registrationErrorHandle = await PushNotifications.addListener("registrationError", (error: any) => {
              console.error("[Push Debug] Registration error:", error);
            });
            await PushNotifications.register();
          } else {
            console.log("[Push Debug] Soft ask declined — app continues normally");
          }
        }, 2800);
      })();
    }, 800);

    return () => {
      mounted = false;
      cancelDefer?.();
      if (softAskTimer) clearTimeout(softAskTimer);
      void actionHandle?.remove();
      void registrationHandle?.remove();
      void registrationErrorHandle?.remove();
    };
  }, [navigate, softAsk]);
}
