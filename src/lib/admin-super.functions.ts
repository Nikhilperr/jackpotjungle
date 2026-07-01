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

export const runDatabaseMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      // Verify user role
      const { data: roleRows, error: rolesErr } = await context.supabase
        .from("user_roles").select("role").eq("user_id", context.userId);
      if (rolesErr) return { success: false, error: rolesErr.message };
      const isSuperAdmin = (roleRows ?? []).some((r: any) => r.role === "super_admin");
      if (!isSuperAdmin) return { success: false, error: "Super admins only" };

      const sql = `
        CREATE TABLE IF NOT EXISTS public.system_announcements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          channel_type TEXT NOT NULL CHECK (channel_type IN ('rules', 'updates')),
          sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
          content TEXT,
          image_url TEXT,
          audio_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "authenticated_select_announcements" ON public.system_announcements;
        CREATE POLICY "authenticated_select_announcements" 
        ON public.system_announcements FOR SELECT TO authenticated USING (true);

        DROP POLICY IF EXISTS "admin_manage_announcements" ON public.system_announcements;
        CREATE POLICY "admin_manage_announcements" 
        ON public.system_announcements FOR ALL TO authenticated 
        USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
        WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_announcements TO authenticated;
        GRANT ALL ON public.system_announcements TO service_role;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'system_announcements'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.system_announcements;
          END IF;
        END $$;

        ALTER TABLE public.system_announcements REPLICA IDENTITY FULL;
      `;

      const pg = (await import("pg")).default;
      
      // Try process.env.DATABASE_URL first
      if (process.env.DATABASE_URL) {
        console.log("[Migration] Found DATABASE_URL, attempting connection...");
        const client = new pg.Client({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes("supabase.co") || process.env.DATABASE_URL.includes("chancerealm.casino")
            ? { rejectUnauthorized: false }
            : undefined
        });
        try {
          await client.connect();
          console.log("[Migration] Connected using DATABASE_URL! Executing SQL...");
          await client.query(sql);
          await client.end();
          console.log("[Migration] SQL executed successfully using DATABASE_URL!");
          return { success: true, message: "Executed successfully using DATABASE_URL" };
        } catch (e: any) {
          console.warn("[Migration] Connection using DATABASE_URL failed:", e.message);
          try { await client.end(); } catch {}
        }
      }

      const dbPassword = "grootMahakal7X";
      const host = "db.chancerealm.casino";
      const dbName = "postgres";
      const username = "postgres";

      const hosts = ["localhost", "127.0.0.1", "db.gsnhqzsgptqxtlhggzkz.supabase.co", "db.chancerealm.casino", "db"];
      const ports = [5432, 6543];

      for (const h of hosts) {
        for (const p of ports) {
          console.log(`[Migration] Trying connection to ${h}:${p}...`);
          const client = new pg.Client({
            connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
            ssl: h === "db.chancerealm.casino" || h === "db.gsnhqzsgptqxtlhggzkz.supabase.co" ? { rejectUnauthorized: false } : undefined
          });
          try {
            await client.connect();
            console.log(`[Migration] Connected to ${h}:${p}! Executing SQL...`);
            await client.query(sql);
            await client.end();
            console.log(`[Migration] SQL executed successfully on ${h}:${p}!`);
            return { success: true, message: `Executed successfully on ${h}:${p}` };
          } catch (e: any) {
            console.warn(`[Migration] Failed on ${h}:${p}:`, e.message);
            try { await client.end(); } catch {}
          }
        }
      }
      return { success: false, error: "Could not connect to database on any host/port configuration" };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

export const publishSystemAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { channelType: "rules" | "updates"; content: string; imageUrl?: string | null; audioUrl?: string | null }) => {
    if (!d.content?.trim() && !d.imageUrl && !d.audioUrl) throw new Error("Empty announcement");
    return d;
  })
  .handler(async ({ data, context }) => {
    try {
      const { data: roleRows, error: rolesErr } = await context.supabase
        .from("user_roles").select("role").eq("user_id", context.userId);
      if (rolesErr) return { success: false, error: rolesErr.message };
      const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
      if (!isAdmin) return { success: false, error: "Admins only" };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: insRow, error } = await supabaseAdmin
        .from("system_announcements")
        .insert({
          channel_type: data.channelType,
          sender_id: context.userId,
          content: data.content,
          image_url: data.imageUrl ?? null,
          audio_url: data.audioUrl ?? null,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[publishSystemAnnouncement Error]:", error);
        return { success: false, error: error.message };
      }

      // Trigger FCM push notification to all users
      try {
        const { sendPushNotification } = await import("@/lib/fcm.server");
        const { data: tokenRows } = await supabaseAdmin.from("push_tokens").select("token");
        const tokens = (tokenRows ?? []).map((t: any) => t.token);
        if (tokens.length > 0) {
          const title = data.channelType === "rules" ? "Jackpot Jungle Rules Update" : "Jackpot Jungle Announcement";
          const body = data.content ? (data.content.length > 80 ? data.content.substring(0, 80) + "..." : data.content) : "New media published";
          await sendPushNotification(tokens, title, body, {
            type: "announcement",
            channelType: data.channelType,
          });
        }
      } catch (pushErr: any) {
        console.error("[FCM Announcement Push Error]:", pushErr.message);
      }

      return { success: true, data: insRow };
    } catch (e: any) {
      console.error("[publishSystemAnnouncement Catch Error]:", e);
      return { success: false, error: e.message };
    }
  });

export const deleteSystemAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    try {
      const { data: roleRows, error: rolesErr } = await context.supabase
        .from("user_roles").select("role").eq("user_id", context.userId);
      if (rolesErr) return { success: false, error: rolesErr.message };
      const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
      if (!isAdmin) return { success: false, error: "Admins only" };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("system_announcements")
        .delete()
        .eq("id", data.id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
