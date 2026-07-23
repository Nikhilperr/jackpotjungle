import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { registerPushTokenServer } from "@/lib/push-register.functions";
import { runAfterFirstPaint } from "@/lib/native/defer";

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

export function useNativePush() {
  const navigate = useNavigate();

  useEffect(() => {
    console.log("[Push Debug] useNativePush mounted");
    let mounted = true;
    let cancelDefer: (() => void) | null = null;
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

    // Register tap listener ASAP (before the deferred token registration) so cold-start
    // taps are not dropped while waiting for first paint.
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

        // If the app was opened from a notification, Capacitor may expose delivered ones.
        try {
          const delivered = await PushNotifications.getDeliveredNotifications();
          // No reliable "launch notification" API across versions — keep delivered list only.
          void delivered;
        } catch {
          /* ignore */
        }
      } catch (err) {
        console.warn("[Push Debug] Early action listener setup failed:", err);
      }
    })();

    cancelDefer = runAfterFirstPaint(() => {
      if (!mounted) return;
      void (async () => {
        const cap = (window as any).Capacitor;
        if (!cap) {
          console.log("[Push Debug] Capacitor global is not present (running on web).");
          return;
        }

        const waitForBridge = () => {
          return new Promise<boolean>((resolve) => {
            const check = () => {
              const c = (window as any).Capacitor;
              const headers = c?.PluginHeaders;
              return !!(c && headers && headers.length > 0);
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
        };

        console.log("[Push Debug] Waiting for bridge confirmation...");
        const ok = await waitForBridge();
        if (!ok || !mounted) {
          console.log("[Push Debug] Bridge wait timed out or component unmounted.");
          return;
        }

        console.log("[Push Debug] Importing @capacitor/push-notifications");
        const pluginModule = await import("@capacitor/push-notifications");
        const PushNotifications = pluginModule.PushNotifications;
        console.log("[Push Debug] Plugin loaded successfully");

        try {
          console.log("[Push Debug] Calling requestPermissions...");
          const permStatus = await PushNotifications.requestPermissions();
          console.log("[Push Debug] requestPermissions result =", permStatus);

          if (permStatus.receive === "granted" && mounted) {
            console.log("[Push Debug] Permission granted. Registering listeners and calling register()...");

            if (cap.getPlatform?.() === "android") {
              try {
                await PushNotifications.createChannel({
                  id: "calls_v2",
                  name: "Phone Calls",
                  description: "Alerts for incoming voice and video calls",
                  importance: 5,
                  visibility: 1,
                  sound: "default",
                  vibration: true,
                });
                // High-visibility channel for chat / page inbox (Messenger-like heads-up).
                // New channel id required — Android ignores sound changes on existing channels.
                await PushNotifications.createChannel({
                  id: "chat_messages_v2",
                  name: "Messages",
                  description: "Chat and support message alerts",
                  importance: 5,
                  visibility: 1,
                  sound: "default",
                  vibration: true,
                });
                try {
                  await PushNotifications.deleteChannel({ id: "chat_messages" });
                } catch {
                  /* ignore */
                }
                console.log("[Push Debug] Created notification channels");
              } catch (channelErr) {
                console.error("[Push Debug] Failed to create channels:", channelErr);
              }
            }

            registrationHandle = await PushNotifications.addListener("registration", async (token: any) => {
              console.log("[FCM Token]", token.value);
              const { data: u } = await supabase.auth.getUser();
              if (!u.user) return;

              try {
                const res = await registerPushTokenServer({
                  data: {
                    userId: u.user.id,
                    token: token.value,
                    platform: cap.getPlatform?.() ?? "android",
                  },
                });
                console.log("[Push Debug] Server registration response:", res);
              } catch (err) {
                console.error("[Push Debug] Failed to register token via server:", err);
              }
            });

            registrationErrorHandle = await PushNotifications.addListener("registrationError", (error: any) => {
              console.error("[Push Debug] Registration error:", error);
            });

            // Ensure tap listener exists even if early setup raced.
            if (!actionHandle) {
              actionHandle = await PushNotifications.addListener(
                "pushNotificationActionPerformed",
                handleAction,
              );
            }

            await PushNotifications.register();
            console.log("[Push Debug] register() invoked");
          } else {
            console.log("[Push Debug] Permission not granted or component unmounted. State =", permStatus.receive);
          }
        } catch (err) {
          console.error("[Push Debug] PushNotifications operation failed:", err);
        }
      })();
    }, 500);

    return () => {
      mounted = false;
      cancelDefer?.();
      void actionHandle?.remove();
      void registrationHandle?.remove();
      void registrationErrorHandle?.remove();
    };
  }, [navigate]);
}
