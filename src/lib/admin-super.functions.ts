import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Super admin only");
}

export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; blocked: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_blocked: data.blocked })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    // Optional: ban via auth admin
    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.blocked ? "876000h" : "none",
    } as any);
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; newPassword: string }) => {
    if (!d.newPassword || d.newPassword.length < 6) throw new Error("Password too short");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { content: string; targetType: "all" | "tag" | "selected"; tagId?: string; userIds?: string[] }) => {
    if (!d.content?.trim()) throw new Error("Empty broadcast");
    return d;
  })
  .handler(async ({ data, context }) => {
    // verify admin
    const { data: roleRows } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let targetIds: string[] = [];
    if (data.targetType === "all") {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id");
      targetIds = (profs ?? []).map((p: any) => p.id);
    } else if (data.targetType === "tag" && data.tagId) {
      const { data: tagged } = await supabaseAdmin.from("user_tags").select("user_id").eq("tag_id", data.tagId);
      targetIds = (tagged ?? []).map((t: any) => t.user_id);
    } else if (data.targetType === "selected") {
      targetIds = data.userIds ?? [];
    }
    targetIds = targetIds.filter((id) => id !== context.userId);

    // Ensure each user has a page_conversation and insert a from_page message
    let sent = 0;
    for (const uid of targetIds) {
      const { data: conv } = await supabaseAdmin
        .from("page_conversations")
        .upsert({ user_id: uid }, { onConflict: "user_id" })
        .select("id")
        .single();
      if (!conv) continue;
      const { error } = await supabaseAdmin.from("page_messages").insert({
        conversation_id: conv.id,
        sender_id: context.userId,
        from_page: true,
        content: data.content,
      });
      if (!error) sent++;
    }

    await supabaseAdmin.from("broadcasts").insert({
      admin_id: context.userId,
      content: data.content,
      target_type: data.targetType,
      target_tag_id: data.tagId ?? null,
      target_user_ids: data.targetType === "selected" ? targetIds : null,
      sent_count: sent,
    });

    return { ok: true, sent };
  });
