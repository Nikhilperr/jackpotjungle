import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const registerPushTokenServer = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string; token: string; platform: string }) => data)
  .handler(async ({ data }) => {
    try {
      console.log(`[FCM Register] Registering token for user ${data.userId}`);

      // 1. Defensively delete any existing mappings for this token (bypasses RLS)
      await supabaseAdmin
        .from("push_tokens")
        .delete()
        .eq("token", data.token);

      // 2. Insert fresh mapping for the current active user
      const { error } = await supabaseAdmin
        .from("push_tokens")
        .insert({
          user_id: data.userId,
          token: data.token,
          platform: data.platform,
        });

      if (error) {
        console.error("[FCM Register] Error inserting token:", error);
        return { success: false, error: error.message };
      }

      console.log(`[FCM Register] Token registered successfully for user ${data.userId}`);
      return { success: true };
    } catch (err: any) {
      console.error("[FCM Register] Failed to register token:", err);
      return { success: false, error: err.message };
    }
  });
