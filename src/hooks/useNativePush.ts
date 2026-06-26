import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Registers the device for Capacitor push notifications (Android/iOS only).
 * No-op on web. Stores the FCM/APNS token in `push_tokens` for the current user.
 *
 * Requires native build: `npx cap add android && npx cap sync` and Firebase
 * `google-services.json` placed in `android/app/`.
 */
export function useNativePush() {
  useEffect(() => {
    console.log("[Push Debug] useNativePush mounted");
    let mounted = true;
    (async () => {
      console.log("[Push Debug] window.Capacitor =", (window as any).Capacitor);
      // Detect Capacitor native runtime without hard-failing on web.
      const cap = (globalThis as any).Capacitor;
      console.log("[Push Debug] isNativePlatform =", cap?.isNativePlatform?.());
      if (!cap?.isNativePlatform?.()) return;

      const { PushNotifications } = await import("@capacitor/push-notifications");

      // 1. Register all listeners first
      console.log("[Push Debug] Registering listeners");
      
      PushNotifications.addListener("registration", async (token) => {
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
            { onConflict: "token" },
          );
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.error("Push registration error", err);
      });

      PushNotifications.addListener("pushNotificationActionPerformed", (evt) => {
        const data = evt.notification?.data as Record<string, string> | undefined;
        const url = data?.url;
        if (url && typeof window !== "undefined") window.location.assign(url);
      });

      // 2. Call requestPermissions() directly
      console.log("[Push Debug] Calling requestPermissions directly");
      let status;
      try {
        const perm = await PushNotifications.requestPermissions();
        console.log("[Push Debug] requestPermissions result =", perm);
        status = perm.receive;
      } catch (error) {
        console.error("[Push Debug] requestPermissions error", error);
        return;
      }

      // 4. If permission is granted, call register()
      if (status === "granted" && mounted) {
        console.log("[Push Debug] Permission granted, calling register()");
        await PushNotifications.register();
      } else {
        console.log("[Push Debug] Permission not granted or component unmounted. status =", status);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
}
