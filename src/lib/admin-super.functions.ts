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
    console.log("[sendBroadcast] === START ===");
    console.log("[sendBroadcast] authenticated user id:", context.userId);
    console.log("[sendBroadcast] input:", { targetType: data.targetType, tagId: data.tagId, contentLen: data.content?.length, userIdsCount: data.userIds?.length });

    // verify admin
    console.log("[sendBroadcast] -> querying user_roles for caller");
    const { data: roleRows, error: rolesErr } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rolesErr) {
      console.error("[sendBroadcast] user_roles select FAILED:", rolesErr);
      throw new Error(rolesErr.message);
    }
    console.log("[sendBroadcast] <- resolved roles:", roleRows);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) {
      console.error("[sendBroadcast] caller is not admin/super_admin");
      throw new Error("Admins only");
    }

    console.log("[sendBroadcast] -> importing supabaseAdmin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    console.log("[sendBroadcast] <- supabaseAdmin imported");

    let targetIds: string[] = [];
    if (data.targetType === "all") {
      console.log("[sendBroadcast] -> selecting all profiles");
      const { data: profs, error } = await supabaseAdmin.from("profiles").select("id");
      if (error) {
        console.error("[sendBroadcast] profiles select FAILED:", error);
        throw new Error(error.message);
      }
      targetIds = (profs ?? []).map((p: any) => p.id);
      console.log("[sendBroadcast] <- profiles fetched:", targetIds.length);
    } else if (data.targetType === "tag" && data.tagId) {
      console.log("[sendBroadcast] -> selecting user_tags for tag", data.tagId);
      const { data: tagged, error } = await supabaseAdmin.from("user_tags").select("user_id").eq("tag_id", data.tagId);
      if (error) {
        console.error("[sendBroadcast] user_tags select FAILED:", error);
        throw new Error(error.message);
      }
      targetIds = (tagged ?? []).map((t: any) => t.user_id);
      console.log("[sendBroadcast] <- user_tags fetched:", targetIds.length);
    } else if (data.targetType === "selected") {
      targetIds = data.userIds ?? [];
    }
    targetIds = targetIds.filter((id) => id !== context.userId);
    console.log("[sendBroadcast] number of target users:", targetIds.length);
    targetIds.forEach((id, i) => console.log(`[sendBroadcast]   target[${i}]:`, id));

    let sent = 0;
    for (const uid of targetIds) {
      console.log(`[sendBroadcast] -> page_conversations upsert for user ${uid}`);
      const upsertRes = await supabaseAdmin
        .from("page_conversations")
        .upsert({ user_id: uid }, { onConflict: "user_id" })
        .select("id")
        .single();
      console.log(`[sendBroadcast] <- page_conversations upsert result for ${uid}:`, upsertRes);
      if (upsertRes.error) {
        console.error(`[sendBroadcast] page_conversations upsert FAILED for ${uid}:`, upsertRes.error);
        throw new Error(upsertRes.error.message);
      }
      const conv = upsertRes.data;
      if (!conv) {
        console.error(`[sendBroadcast] page_conversations upsert returned no row for ${uid}`);
        throw new Error(`page_conversations upsert returned no row for ${uid}`);
      }

      console.log(`[sendBroadcast] -> page_messages insert for conversation ${conv.id}`);
      const msgRes = await supabaseAdmin.from("page_messages").insert({
        conversation_id: conv.id,
        sender_id: context.userId,
        from_page: true,
        content: data.content,
      });
      console.log(`[sendBroadcast] <- page_messages insert result for ${uid}:`, msgRes);
      if (msgRes.error) {
        console.error(`[sendBroadcast] page_messages insert FAILED for ${uid}:`, msgRes.error);
        throw new Error(msgRes.error.message);
      }
      sent++;
    }

    console.log("[sendBroadcast] -> broadcasts insert");
    const bRes = await supabaseAdmin.from("broadcasts").insert({
      admin_id: context.userId,
      content: data.content,
      target_type: data.targetType,
      target_tag_id: data.tagId ?? null,
      target_user_ids: data.targetType === "selected" ? targetIds : null,
      sent_count: sent,
    });
    console.log("[sendBroadcast] <- broadcasts insert result:", bRes);
    if (bRes.error) {
      console.error("[sendBroadcast] broadcasts insert FAILED:", bRes.error);
      throw new Error(bRes.error.message);
    }

    console.log("[sendBroadcast] === DONE ===", { sent });
    return { ok: true, sent };
  });
