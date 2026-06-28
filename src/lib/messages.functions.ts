import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const unsendMessagesServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Fetch target messages to verify ownership
    const { data: msgs, error: fetchError } = await supabaseAdmin
      .from("messages")
      .select("id, sender_id")
      .in("id", data.ids);
    
    if (fetchError) throw new Error(fetchError.message);
    if (!msgs || msgs.length === 0) throw new Error("No messages found");

    for (const m of msgs) {
      if (m.sender_id !== context.userId) {
        throw new Error("You can only delete your own messages");
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("messages")
      .update({ content: "[system:unsent]", image_url: null, audio_url: null } as any)
      .in("id", data.ids);

    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });

export const unsendPageMessagesServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => d)
  .handler(async ({ data, context }) => {
    // Check if caller is admin/super_admin
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
      
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Verify ownership or admin status
    const { data: msgs, error: fetchError } = await supabaseAdmin
      .from("page_messages")
      .select("id, from_page, sender_id")
      .in("id", data.ids);

    if (fetchError) throw new Error(fetchError.message);
    if (!msgs || msgs.length === 0) throw new Error("No messages found");

    for (const m of msgs) {
      if (m.sender_id === context.userId) {
        // Message owner can delete
        continue;
      }
      if (m.from_page && isAdmin) {
        // Admin can delete messages sent by page
        continue;
      }
      throw new Error("You can only delete your own messages");
    }

    const { error: updateError } = await supabaseAdmin
      .from("page_messages")
      .update({ content: "[system:unsent]", image_url: null, audio_url: null } as any)
      .in("id", data.ids);

    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });
