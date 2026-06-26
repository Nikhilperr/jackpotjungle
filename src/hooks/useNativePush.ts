import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// --- EXPERIMENT INSTRUMENTATION START ---
const startTime = typeof window !== "undefined" ? performance.now() : 0;
let delayImport = true;

if (typeof window !== "undefined") {
  console.log(`[Push Debug] Experiment script loaded. Time: ${new Date().toISOString()}`);

  // Retrieve or toggle the configuration flag
  const currentFlag = localStorage.getItem("push_delay_import");
  if (currentFlag === null) {
    localStorage.setItem("push_delay_import", "false");
    delayImport = false;
  } else {
    delayImport = currentFlag === "true";
    localStorage.setItem("push_delay_import", delayImport ? "false" : "true");
  }
  console.log(`[Push Debug] [Experiment Config] delayImport = ${delayImport} (will toggle on next reload)`);

  // Helper to check the current bridge status
  const checkBridgeStatus = () => {
    const cap = (window as any).Capacitor;
    const headers = cap?.PluginHeaders;
    const hasPushHeader = headers?.some((h: any) => h.name === "PushNotifications");
    return {
      exists: !!cap,
      hasHeaders: !!headers && headers.length > 0,
      hasPushHeader: !!hasPushHeader,
    };
  };

  // 1. Log when the Capacitor bridge becomes available
  let bridgeLogged = false;
  const interval = setInterval(() => {
    const status = checkBridgeStatus();
    if (status.exists && status.hasHeaders && !bridgeLogged) {
      bridgeLogged = true;
      console.log(
        `[Push Debug] 1. Bridge became fully available. Time offset: ${performance.now() - startTime}ms. Has PushNotifications header: ${status.hasPushHeader}`
      );
      clearInterval(interval);
    }
  }, 5);

  // Hook and intercept Capacitor.registerPlugin
  const hookRegisterPlugin = (capObj: any) => {
    if (capObj && !capObj.__hooked) {
      capObj.__hooked = true;
      let orig = capObj.registerPlugin;
      Object.defineProperty(capObj, "registerPlugin", {
        configurable: true,
        enumerable: true,
        get() {
          return (pluginName: string, jsImplementations: any) => {
            const statusBefore = checkBridgeStatus();
            // 3. Log when registerPlugin() is called/resolves
            console.log(
              `[Push Debug] 3. registerPlugin() called for "${pluginName}". Time offset: ${performance.now() - startTime}ms. Bridge status before call: exists=${statusBefore.exists}, hasHeaders=${statusBefore.hasHeaders}, hasPushHeader=${statusBefore.hasPushHeader}`
            );

            const resolved = orig.call(capObj, pluginName, jsImplementations);

            const statusAfter = checkBridgeStatus();
            // 4. Log whether it resolves to the native implementation or web fallback
            console.log(
              `[Push Debug] 4. registerPlugin() resolved "${pluginName}". Is native implementation? ${statusAfter.hasPushHeader}`
            );
            return resolved;
          };
        },
        set(val) {
          orig = val;
        },
      });
    }
  };

  // Watch for Capacitor to be defined
  if ((window as any).Capacitor) {
    hookRegisterPlugin((window as any).Capacitor);
  } else {
    let capVal = (window as any).Capacitor;
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      enumerable: true,
      get() {
        return capVal;
      },
      set(newVal) {
        capVal = newVal;
        if (newVal) {
          hookRegisterPlugin(newVal);
        }
      },
    });
  }
}
// --- EXPERIMENT INSTRUMENTATION END ---

export function useNativePush() {
  useEffect(() => {
    console.log("[Push Debug] useNativePush mounted");
    let mounted = true;

    (async () => {
      // 2. Log when PushNotifications is first imported
      const importPlugin = async () => {
        console.log(`[Push Debug] 2. PushNotifications import initiated. Time offset: ${performance.now() - startTime}ms`);
        const { PushNotifications } = await import("@capacitor/push-notifications");
        console.log(`[Push Debug] Import completed. Time offset: ${performance.now() - startTime}ms`);
        return PushNotifications;
      };

      // Helper to poll until the bridge is confirmed to be available
      const waitForBridge = () => {
        return new Promise<boolean>((resolve) => {
          const check = () => {
            const cap = (window as any).Capacitor;
            const headers = cap?.PluginHeaders;
            return !!(cap && headers && headers.length > 0);
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

      let PushNotifications: any;

      if (delayImport) {
        console.log("[Push Debug] Waiting for bridge confirmation before importing...");
        const ok = await waitForBridge();
        if (!ok) {
          console.log("[Push Debug] Bridge wait timed out.");
          return;
        }
        PushNotifications = await importPlugin();
      } else {
        console.log("[Push Debug] Importing immediately (no delay)...");
        PushNotifications = await importPlugin();
      }

      if (!mounted) return;

      // 5. Log outcome of delaying the import vs not delaying
      const cap = (window as any).Capacitor;
      const hasPushHeader = cap?.PluginHeaders?.some((h: any) => h.name === "PushNotifications");
      console.log(
        `[Push Debug] 5. Delaying import was ${delayImport}. Plugin is native proxy? ${hasPushHeader}. Calling requestPermissions...`
      );

      try {
        const permStatus = await PushNotifications.requestPermissions();
        console.log("[Push Debug] requestPermissions result =", permStatus);

        if (permStatus.receive === "granted" && mounted) {
          console.log("[Push Debug] Permission granted, calling register()");

          PushNotifications.addListener("registration", async (token: any) => {
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

          await PushNotifications.register();
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
