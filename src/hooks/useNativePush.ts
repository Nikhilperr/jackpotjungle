import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useNativePush() {
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

          // Register registration and error listeners
          await PushNotifications.addListener("registration", async (token: any) => {
            console.log("[FCM Token]", token.value);
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) return;
            await supabase
              .from("push_tokens" as any)
              .upsert(
                {
                  user_id: u.user.id,
                  token: token.value,
                  platform: cap.getPlatform?.() ?? "android",
                },
                { onConflict: "token" }
              );
          });

          await PushNotifications.addListener("registrationError", (error: any) => {
            console.error("[Push Debug] Registration error:", error);
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
