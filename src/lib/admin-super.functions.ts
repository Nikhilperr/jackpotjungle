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
    // Admins or super admins can block/unblock regular users.
    const { data: roleRows } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_blocked: data.blocked })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
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
    console.log("[sendBroadcast] start", { userId: context.userId, targetType: data.targetType, tagId: data.tagId, contentLen: data.content?.length });

    // verify admin
    const { data: roleRows, error: rolesErr } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rolesErr) { console.error("[sendBroadcast] role lookup failed", rolesErr); throw new Error("Role check failed: " + rolesErr.message); }
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Admins only");

    let supabaseAdmin: any;
    try {
      ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
    } catch (e: any) {
      console.error("[sendBroadcast] admin client import failed", e);
      throw new Error("Admin client unavailable: " + (e?.message ?? String(e)));
    }

    let targetIds: string[] = [];
    if (data.targetType === "all") {
      const { data: profs, error } = await supabaseAdmin.from("profiles").select("id");
      if (error) { console.error("[sendBroadcast] profiles select failed", error); throw new Error("profiles select: " + error.message); }
      targetIds = (profs ?? []).map((p: any) => p.id);
    } else if (data.targetType === "tag" && data.tagId) {
      const { data: tagged, error } = await supabaseAdmin.from("user_tags").select("user_id").eq("tag_id", data.tagId);
      if (error) { console.error("[sendBroadcast] user_tags select failed", error); throw new Error("user_tags select: " + error.message); }
      targetIds = (tagged ?? []).map((t: any) => t.user_id);
    } else if (data.targetType === "selected") {
      targetIds = data.userIds ?? [];
    }
    targetIds = targetIds.filter((id) => id !== context.userId);
    console.log("[sendBroadcast] target count", targetIds.length);

    // Ensure each user has a page_conversation and insert a from_page message
    let sent = 0;
    const errors: string[] = [];
    for (const uid of targetIds) {
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("page_conversations")
        .upsert({ user_id: uid }, { onConflict: "user_id" })
        .select("id")
        .single();
      if (convErr || !conv) {
        const msg = `conv upsert (${uid}): ${convErr?.message ?? "no row"}`;
        console.error("[sendBroadcast]", msg);
        errors.push(msg);
        continue;
      }
      const { error } = await supabaseAdmin.from("page_messages").insert({
        conversation_id: conv.id,
        sender_id: context.userId,
        from_page: true,
        content: data.content,
      });
      if (error) {
        const msg = `page_messages insert (${uid}): ${error.message}`;
        console.error("[sendBroadcast]", msg);
        errors.push(msg);
      } else sent++;
    }

    const { error: bErr } = await supabaseAdmin.from("broadcasts").insert({
      admin_id: context.userId,
      content: data.content,
      target_type: data.targetType,
      target_tag_id: data.tagId ?? null,
      target_user_ids: data.targetType === "selected" ? targetIds : null,
      sent_count: sent,
    });
    if (bErr) {
      console.error("[sendBroadcast] broadcasts insert failed", bErr);
      throw new Error("broadcasts insert: " + bErr.message);
    }

    console.log("[sendBroadcast] done", { sent, errorCount: errors.length });
    return { ok: true, sent, errors: errors.slice(0, 5) };
  });
