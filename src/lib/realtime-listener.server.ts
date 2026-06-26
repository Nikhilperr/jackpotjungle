import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushNotification } from "./fcm.server";

export async function initRealtimeListeners() {
  console.log("[Realtime Listener] Initializing server-side database change listeners...");

  try {
    const channel = supabaseAdmin
      .channel("server-push-notifications")
      // 1. Direct Messages INSERT
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new as {
            id: string;
            sender_id: string;
            receiver_id: string;
            content: string | null;
            image_url: string | null;
            audio_url: string | null;
          };

          if (!m.receiver_id || !m.sender_id) return;

          // Prevent sending a notification to yourself
          if (m.sender_id === m.receiver_id) {
            console.log("[Realtime Listener] Sender and receiver are the same. Skipping notification.");
            return;
          }

          console.log(`[Realtime Listener] New message insert detected. ID: ${m.id}`);

          try {
            // Check if recipient has notifications enabled
            const { data: receiverProfile } = await supabaseAdmin
              .from("profiles")
              .select("notif_enabled" as any)
              .eq("id", m.receiver_id)
              .maybeSingle();

            const enabled = (receiverProfile as any)?.notif_enabled ?? true;
            if (!enabled) {
              console.log(`[Realtime Listener] Recipient ${m.receiver_id} has disabled notifications. Skipping.`);
              return;
            }

            // Fetch sender username
            const { data: senderProfile } = await supabaseAdmin
              .from("profiles")
              .select("username")
              .eq("id", m.sender_id)
              .maybeSingle();

            const senderName = senderProfile?.username || "New message";

            // Fetch recipient push tokens
            const { data: tokensRows } = await supabaseAdmin
              .from("push_tokens" as any)
              .select("token")
              .eq("user_id", m.receiver_id);

            const tokens = (tokensRows ?? []).map((r: any) => r.token);

            if (tokens.length === 0) {
              console.log(`[Realtime Listener] No push tokens found for recipient ${m.receiver_id}.`);
              return;
            }

            const bodyText = m.content || (m.image_url ? "📷 Sent a photo" : "🎤 Sent a voice message");

            await sendPushNotification(tokens, senderName, bodyText, {
              type: "chat",
              sender_id: m.sender_id,
              url: `/chat/${m.sender_id}`,
            });
          } catch (err) {
            console.error("[Realtime Listener] Error processing message push:", err);
          }
        }
      )
      // 2. Support / Page Messages INSERT
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "page_messages" },
        async (payload) => {
          const pm = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            from_page: boolean;
            content: string | null;
            image_url: string | null;
            audio_url: string | null;
          };

          if (!pm.conversation_id || !pm.sender_id) return;

          console.log(`[Realtime Listener] New page message insert detected. ID: ${pm.id}`);

          try {
            const bodyText = pm.content || (pm.image_url ? "📷 Sent a photo" : "🎤 Sent a voice message");

            if (pm.from_page) {
              // Admin replying to user -> Send to the user of the conversation
              const { data: conv } = await supabaseAdmin
                .from("page_conversations")
                .select("user_id")
                .eq("id", pm.conversation_id)
                .maybeSingle();

              const userId = conv?.user_id;
              if (!userId) {
                console.warn(`[Realtime Listener] Could not find user_id for conversation: ${pm.conversation_id}`);
                return;
              }

              // Exclude sender (if the admin somehow is the conversation user)
              if (userId === pm.sender_id) {
                console.log("[Realtime Listener] Admin is conversation user. Skipping notification.");
                return;
              }

              // Check if user has notifications enabled
              const { data: receiverProfile } = await supabaseAdmin
                .from("profiles")
                .select("notif_enabled" as any)
                .eq("id", userId)
                .maybeSingle();

              const enabled = (receiverProfile as any)?.notif_enabled ?? true;
              if (!enabled) {
                console.log(`[Realtime Listener] Page conversation user ${userId} has disabled notifications. Skipping.`);
                return;
              }

              // Fetch user push tokens
              const { data: tokensRows } = await supabaseAdmin
                .from("push_tokens" as any)
                .select("token")
                .eq("user_id", userId);

              const tokens = (tokensRows ?? []).map((r: any) => r.token);

              if (tokens.length === 0) {
                console.log(`[Realtime Listener] No push tokens found for page conversation user ${userId}.`);
                return;
              }

              await sendPushNotification(tokens, "Jackpot Jungle Support", bodyText, {
                type: "page_chat",
                url: "/chat/page",
              });
            } else {
              // User sending to Page -> Send to all Admins & Super Admins (EXCLUDING the sender themselves)
              const { data: adminRows } = await supabaseAdmin
                .from("user_roles" as any)
                .select("user_id")
                .in("role", ["admin", "super_admin"]);

              const adminUserIds = (adminRows ?? [])
                .map((r: any) => r.user_id)
                .filter((id: string) => id !== pm.sender_id); // EXCLUDE SENDER

              if (adminUserIds.length === 0) {
                console.log("[Realtime Listener] No other admin users found. Skipping support message push.");
                return;
              }

              // Fetch sender username
              const { data: senderProfile } = await supabaseAdmin
                .from("profiles")
                .select("username")
                .eq("id", pm.sender_id)
                .maybeSingle();

              const senderName = senderProfile?.username || "Guest";

              // Fetch admin push tokens
              const { data: tokensRows } = await supabaseAdmin
                .from("push_tokens" as any)
                .select("token")
                .in("user_id", adminUserIds);

              const tokens = (tokensRows ?? []).map((r: any) => r.token);

              if (tokens.length === 0) {
                console.log("[Realtime Listener] No push tokens found for admin users.");
                return;
              }

              await sendPushNotification(tokens, `Support from ${senderName}`, bodyText, {
                type: "admin_support",
                url: `/admin`,
              });
            }
          } catch (err) {
            console.error("[Realtime Listener] Error processing page message push:", err);
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime Listener] Subscription status: ${status}`);
        if (status === "SUBSCRIBED") {
          console.log("[Realtime Listener] Successfully connected and listening to public.messages and public.page_messages inserts!");
        }
      });
  } catch (error) {
    console.error("[Realtime Listener] Fatal error initializing database channel subscription:", error);
  }
}
