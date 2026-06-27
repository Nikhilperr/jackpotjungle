import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { registerPushTokenServer } from "@/lib/push-register.functions";

export function useNativePush() {
  const navigate = useNavigate();

  useEffect(() => {
    console.log("[Push Debug] useNativePush mounted");
    let mounted = true;

    (async () => {
      // 1. Detect if Capacitor is available
      const cap = (window as any).Capacitor;
      if (!cap) {
        console.log("[Push Debug] Capacitor global is not present (running on web).");
        return;
      }

      // Helper to poll until the bridge is fully available (PluginHeaders populated)
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

      // 2. Perform the dynamic import in-place
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

          // Create the high-priority calls channel for Android
          if (cap.getPlatform?.() === "android") {
            try {
              await PushNotifications.createChannel({
                id: "calls_v2",
                name: "Phone Calls",
                description: "Alerts for incoming voice and video calls",
                importance: 5, // IMPORTANCE_HIGH (makes sound and shows as heads-up/banner)
                visibility: 1, // VISIBILITY_PUBLIC (shows content on lockscreen)
                sound: "default",
                vibration: true,
              });
              console.log("[Push Debug] Created high-priority 'calls' channel");
            } catch (channelErr) {
              console.error("[Push Debug] Failed to create calls channel:", channelErr);
            }
          }

          // Register registration and error listeners
          await PushNotifications.addListener("registration", async (token: any) => {
            console.log("[FCM Token]", token.value);
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) return;

            try {
              const res = await registerPushTokenServer({
                data: {
                  userId: u.user.id,
                  token: token.value,
                  platform: cap.getPlatform?.() ?? "android",
                }
              });
              console.log("[Push Debug] Server registration response:", res);
            } catch (err) {
              console.error("[Push Debug] Failed to register token via server:", err);
            }
          });

          await PushNotifications.addListener("registrationError", (error: any) => {
            console.error("[Push Debug] Registration error:", error);
          });

          // Register tapped action listener
          await PushNotifications.addListener("pushNotificationActionPerformed", (action: any) => {
            console.log("[Push Debug] Action performed:", action);
            let url = action.notification?.data?.url;
            if (url) {
              const callAction = action.notification?.data?.action;
              const callId = action.notification?.data?.call_id;
              if (callAction && callId) {
                url = url.includes("?") 
                  ? `${url}&action=${callAction}&call_id=${callId}` 
                  : `${url}?action=${callAction}&call_id=${callId}`;
              }
              console.log(`[Push Debug] Tapped notification. Redirecting to URL: ${url}`);
              navigate({ to: url });
            }
          });

          await PushNotifications.register();
          console.log("[Push Debug] register() invoked");
        } else {
          console.log("[Push Debug] Permission not granted or component unmounted. State =", permStatus.receive);
        }
      } catch (err) {
        console.error("[Push Debug] PushNotifications operation failed:", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);
}

