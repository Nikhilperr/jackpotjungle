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
    let mounted = true;
    (async () => {
      // Detect Capacitor native runtime without hard-failing on web.
      const cap = (globalThis as any).Capacitor;
      if (!cap?.isNativePlatform?.()) return;

      const { PushNotifications } = await import("@capacitor/push-notifications");

      const perm = await PushNotifications.checkPermissions();
      let status = perm.receive;
      if (status === "prompt" || status === "prompt-with-rationale") {
        status = (await PushNotifications.requestPermissions()).receive;
      }
      if (status !== "granted" || !mounted) return;

      await PushNotifications.register();

      PushNotifications.addListener("registration", async (token) => {
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
    })();
    return () => {
      mounted = false;
    };
  }, []);
}
