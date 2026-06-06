import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to messages globally and shows a browser notification
 * when a new message arrives for the current user while the tab is hidden.
 * Respects profiles.notif_enabled.
 */
export function useChatNotifications() {
  useEffect(() => {
    let myId: string | null = null;
    let enabled = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      myId = u.user.id;
      const { data: prof } = await supabase
        .from("profiles")
        .select("notif_enabled" as any)
        .eq("id", myId)
        .maybeSingle();
      enabled = (prof as any)?.notif_enabled ?? true;

      channel = supabase
        .channel(`notif-${myId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${myId}` },
          async (payload) => {
            const m = payload.new as { sender_id: string; content: string | null; image_url: string | null };
            if (!enabled) return;
            if (document.visibilityState === "visible") return;
            if (typeof window === "undefined" || !("Notification" in window)) return;
            if (Notification.permission !== "granted") return;
            const { data: sender } = await supabase
              .from("profiles")
              .select("username, avatar_url")
              .eq("id", m.sender_id)
              .maybeSingle();
            try {
              new Notification(sender?.username ?? "New message", {
                body: m.content || (m.image_url ? "📷 Photo" : ""),
                icon: sender?.avatar_url ?? undefined,
                tag: `msg-${m.sender_id}`,
              });
            } catch {
              /* ignore */
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}
