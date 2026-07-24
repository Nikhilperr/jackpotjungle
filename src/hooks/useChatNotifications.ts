import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  initActiveConversationLifecycle,
  setMyUserId,
  shouldSuppressChatNotification,
} from "@/lib/active-conversation";

/**
 * Browser notifications with Messenger-style context rules:
 * - Background → notify
 * - Foreground + not in that chat → notify
 * - Foreground + viewing that chat → suppress
 * Native Android OS banners come from FCM (also context-gated).
 */
export function useChatNotifications() {
  useEffect(() => {
    let myId: string | null = null;
    let enabled = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pageChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      myId = u.user.id;
      setMyUserId(myId);
      initActiveConversationLifecycle(myId);

      const { data: prof } = await supabase
        .from("profiles")
        .select("notif_enabled" as any)
        .eq("id", myId)
        .maybeSingle();
      enabled = (prof as any)?.notif_enabled ?? true;

      const showBrowserNotification = async (opts: {
        conversationKey: string;
        title: string;
        body: string;
        icon?: string | null;
        tag: string;
      }) => {
        if (!enabled) return;
        if (shouldSuppressChatNotification(opts.conversationKey)) return;
        if (typeof window === "undefined" || !("Notification" in window)) return;
        if (Notification.permission !== "granted") return;
        // Native Android uses FCM — avoid double banners in the WebView.
        const cap = (window as any).Capacitor;
        if (cap?.isNativePlatform?.()) return;
        try {
          new Notification(opts.title, {
            body: opts.body,
            icon: opts.icon ?? undefined,
            tag: opts.tag,
          });
        } catch {
          /* ignore */
        }
      };

      channel = supabase
        .channel(`notif-${myId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${myId}` },
          async (payload) => {
            const m = payload.new as {
              sender_id: string;
              group_id?: string | null;
              content: string | null;
              image_url: string | null;
            };
            const conversationKey = m.group_id ? `group-${m.group_id}` : m.sender_id;
            if (shouldSuppressChatNotification(conversationKey)) return;
            const { data: sender } = await supabase
              .from("profiles")
              .select("username, avatar_url")
              .eq("id", m.sender_id)
              .maybeSingle();
            await showBrowserNotification({
              conversationKey,
              title: sender?.username ?? "New message",
              body: m.content || (m.image_url ? "📷 Photo" : ""),
              icon: sender?.avatar_url,
              tag: `msg-${conversationKey}`,
            });
          },
        )
        .subscribe();

      pageChannel = supabase
        .channel(`notif-page-${myId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "page_messages" },
          async (payload) => {
            const pm = payload.new as {
              conversation_id: string;
              from_page: boolean;
              content: string | null;
              image_url: string | null;
            };
            if (!pm.from_page || !pm.conversation_id) return;
            const conversationKey = `page:${pm.conversation_id}`;
            if (
              shouldSuppressChatNotification(conversationKey) ||
              shouldSuppressChatNotification("page")
            ) {
              return;
            }
            await showBrowserNotification({
              conversationKey,
              title: "Jackpot Jungle",
              body: pm.content || (pm.image_url ? "📷 Photo" : "Sent a message"),
              tag: `page-${pm.conversation_id}`,
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (pageChannel) supabase.removeChannel(pageChannel);
    };
  }, []);
}
