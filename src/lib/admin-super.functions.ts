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
  .validator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string; blocked: boolean }) => d)
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
  .validator((d: { userId: string; newPassword: string }) => {
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
  .validator((d: { content: string; targetType: "all" | "tag" | "selected"; tagId?: string; userIds?: string[] }) => {
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

export const MIGRATIONS_SQL = `
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

        -- Create public.group_invites table for secure invite links
        CREATE TABLE IF NOT EXISTS public.group_invites (
          token TEXT PRIMARY KEY,
          group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
          created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL
        );

        ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_invites TO authenticated;
        GRANT ALL ON public.group_invites TO service_role;

        DROP POLICY IF EXISTS "anyone can read active invites" ON public.group_invites;
        CREATE POLICY "anyone can read active invites" ON public.group_invites FOR SELECT TO authenticated
          USING (expires_at > now());

        DROP POLICY IF EXISTS "members can create invites" ON public.group_invites;
        CREATE POLICY "members can create invites" ON public.group_invites FOR INSERT TO authenticated
          WITH CHECK (
            public.is_group_member(group_id, auth.uid()) OR
            public.has_role(auth.uid(), 'super_admin') OR
            public.has_role(auth.uid(), 'admin')
          );

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'group_invites'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.group_invites;
          END IF;
        END $$;

        ALTER TABLE public.group_invites REPLICA IDENTITY FULL;

        -- Fix and strengthen RLS policies for groups, group_members, and messages to support app-level admins/super_admins
        DROP POLICY IF EXISTS "view_groups" ON public.groups;
        CREATE POLICY "view_groups" ON public.groups FOR SELECT TO authenticated
          USING (
            created_by = auth.uid() OR
            public.is_group_member(id, auth.uid()) OR
            public.has_role(auth.uid(), 'super_admin') OR
            public.has_role(auth.uid(), 'admin')
          );

        DROP POLICY IF EXISTS "update_groups" ON public.groups;
        CREATE POLICY "update_groups" ON public.groups FOR UPDATE TO authenticated
          USING (
            auth.uid() = created_by OR
            public.is_group_admin(id, auth.uid()) OR
            public.has_role(auth.uid(), 'super_admin') OR
            public.has_role(auth.uid(), 'admin')
          );

        DROP POLICY IF EXISTS "view_group_members" ON public.group_members;
        CREATE POLICY "view_group_members" ON public.group_members FOR SELECT TO authenticated
          USING (
            public.is_group_member(group_id, auth.uid()) OR
            EXISTS (
              SELECT 1 FROM public.groups
              WHERE id = group_id AND created_by = auth.uid()
            ) OR
            public.has_role(auth.uid(), 'super_admin') OR
            public.has_role(auth.uid(), 'admin')
          );

        DROP POLICY IF EXISTS "insert_group_members" ON public.group_members;
        CREATE POLICY "insert_group_members" ON public.group_members FOR INSERT TO authenticated
          WITH CHECK (
            -- Creator/Admin insert check
            (auth.uid() = user_id OR
            public.is_group_admin(group_id, auth.uid()) OR
            EXISTS (
              SELECT 1 FROM public.groups
              WHERE id = group_id AND created_by = auth.uid()
            ) OR
            public.has_role(auth.uid(), 'super_admin'::app_role) OR
            public.has_role(auth.uid(), 'admin'::app_role))
            
            -- Friendship constraint check
            AND (
              auth.uid() = user_id OR
              public.has_role(auth.uid(), 'super_admin'::app_role) OR
              public.has_role(auth.uid(), 'admin'::app_role) OR
              EXISTS (
                SELECT 1 FROM public.friendships
                WHERE (user_a = auth.uid() AND user_b = user_id)
                   OR (user_a = user_id AND user_b = auth.uid())
              ) OR
              public.has_role(user_id, 'admin'::app_role) OR
              public.has_role(user_id, 'super_admin'::app_role)
            )
          );

        DROP POLICY IF EXISTS "update_group_members" ON public.group_members;
        CREATE POLICY "update_group_members" ON public.group_members FOR UPDATE TO authenticated
          USING (
            public.is_group_admin(group_id, auth.uid()) OR
            public.has_role(auth.uid(), 'super_admin') OR
            public.has_role(auth.uid(), 'admin')
          );

        DROP POLICY IF EXISTS "delete_group_members" ON public.group_members;
        CREATE POLICY "delete_group_members" ON public.group_members FOR DELETE TO authenticated
          USING (
            auth.uid() = user_id OR
            public.is_group_admin(group_id, auth.uid()) OR
            public.has_role(auth.uid(), 'super_admin') OR
            public.has_role(auth.uid(), 'admin')
          );

        DROP POLICY IF EXISTS "view own messages" ON public.messages;
        CREATE POLICY "view own messages" ON public.messages FOR SELECT TO authenticated
          USING (
            auth.uid() = sender_id OR 
            auth.uid() = receiver_id OR
            (group_id IS NOT NULL AND (
              public.is_group_member(group_id, auth.uid()) OR
              public.has_role(auth.uid(), 'super_admin') OR
              public.has_role(auth.uid(), 'admin')
            ))
          );

        DROP POLICY IF EXISTS "send messages" ON public.messages;
        CREATE POLICY "send messages" ON public.messages FOR INSERT TO authenticated
          WITH CHECK (
            auth.uid() = sender_id 
            AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_blocked = true)
            AND (
              group_id IS NULL OR 
              public.is_group_member(group_id, auth.uid()) OR
              public.has_role(auth.uid(), 'super_admin') OR
              public.has_role(auth.uid(), 'admin')
            )
          );

        -- Update storage buckets to be public for CDN/public access compatibility
        UPDATE storage.buckets SET public = true WHERE id IN ('avatars', 'chat-images', 'chat-audio');

        -- 1. SELECT policy: Allow all authenticated users to read avatars, chat images, and chat audio
        DROP POLICY IF EXISTS "auth read media" ON storage.objects;
        CREATE POLICY "auth read media" ON storage.objects FOR SELECT TO authenticated
        USING (
          bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
        );

        -- 2. INSERT policy: Allow users to upload to their own user directory, or group admins to group directory
        DROP POLICY IF EXISTS "user upload media" ON storage.objects;
        CREATE POLICY "user upload media" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
          AND (
            (auth.uid())::text = (storage.foldername(name))[1]
            OR (
              bucket_id = 'avatars'
              AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              AND public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
            )
            OR public.has_role(auth.uid(), 'super_admin')
            OR public.has_role(auth.uid(), 'admin')
          )
        );

        -- 3. UPDATE policy: Allow users to update their own files, or group admins to update group files
        DROP POLICY IF EXISTS "user update media" ON storage.objects;
        CREATE POLICY "user update media" ON storage.objects FOR UPDATE TO authenticated
        USING (
          bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
          AND (
            (auth.uid())::text = (storage.foldername(name))[1]
            OR (
              bucket_id = 'avatars'
              AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              AND public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
            )
            OR public.has_role(auth.uid(), 'super_admin')
            OR public.has_role(auth.uid(), 'admin')
          )
        );

        -- 4. DELETE policy: Allow users to delete their own files, or group admins to delete group files
        DROP POLICY IF EXISTS "user delete media" ON storage.objects;
        CREATE POLICY "user delete media" ON storage.objects FOR DELETE TO authenticated
        USING (
          bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
          AND (
            (auth.uid())::text = (storage.foldername(name))[1]
            OR (
              bucket_id = 'avatars'
              AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              AND public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
            )
            OR public.has_role(auth.uid(), 'super_admin')
            OR public.has_role(auth.uid(), 'admin')
        );

        -- Add is_edited column if not exists to messages and page_messages
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
        ALTER TABLE public.page_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;

        -- Grant UPDATE on content and is_edited columns
        GRANT UPDATE (content, is_edited) ON public.messages TO authenticated;
        GRANT UPDATE (content, is_edited) ON public.page_messages TO authenticated;

        -- Create RLS policies to allow updating own messages
        DROP POLICY IF EXISTS "allow edit own messages" ON public.messages;
        CREATE POLICY "allow edit own messages" ON public.messages FOR UPDATE TO authenticated
          USING (auth.uid() = sender_id)
          WITH CHECK (auth.uid() = sender_id);

        DROP POLICY IF EXISTS "allow edit own page messages" ON public.page_messages;
        CREATE POLICY "allow edit own page messages" ON public.page_messages FOR UPDATE TO authenticated
          USING (auth.uid() = sender_id)
          WITH CHECK (auth.uid() = sender_id);

        -- Add is_admin_team column to groups table
        ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_admin_team BOOLEAN DEFAULT false;

        -- Create trigger function to enforce only admins can create/modify admin team groups
        CREATE OR REPLACE FUNCTION public.check_group_admin_team_creation()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.is_admin_team = true THEN
            IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
              RAISE EXCEPTION 'Only administrators can create or modify admin team groups.';
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        DROP TRIGGER IF EXISTS trg_check_group_admin_team_creation ON public.groups;
        CREATE TRIGGER trg_check_group_admin_team_creation
        BEFORE INSERT OR UPDATE ON public.groups
        FOR EACH ROW EXECUTE FUNCTION public.check_group_admin_team_creation();

        -- Create trigger function to enforce only admins can join admin team groups
        CREATE OR REPLACE FUNCTION public.check_admin_team_membership()
        RETURNS TRIGGER AS $$
        DECLARE
          g_admin_team BOOLEAN;
          u_is_admin BOOLEAN;
        BEGIN
          SELECT is_admin_team INTO g_admin_team FROM public.groups WHERE id = NEW.group_id;
          
          IF g_admin_team = true THEN
            SELECT EXISTS (
              SELECT 1 FROM public.user_roles 
              WHERE user_id = NEW.user_id AND role IN ('admin', 'super_admin')
            ) INTO u_is_admin;
            
            IF u_is_admin = false THEN
              RAISE EXCEPTION 'Only administrators can be members of admin team groups.';
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        DROP TRIGGER IF EXISTS trg_check_admin_team_membership ON public.group_members;
        CREATE TRIGGER trg_check_admin_team_membership
        BEFORE INSERT OR UPDATE ON public.group_members
        FOR EACH ROW EXECUTE FUNCTION public.check_admin_team_membership();

        -- Add user management fields to profiles table
        ALTER TABLE public.profiles 
          ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
          ADD COLUMN IF NOT EXISTS cover_photo TEXT,
          ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0,
          ADD COLUMN IF NOT EXISTS vip_status TEXT DEFAULT 'none',
          ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark',
          ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
          ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

        -- Alter profiles to add wallet columns for Premium Wallet Credit System
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credit_balance NUMERIC DEFAULT 0;
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_deposits NUMERIC DEFAULT 0;
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_released NUMERIC DEFAULT 0;
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_used NUMERIC DEFAULT 0;
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_last_updated TIMESTAMPTZ DEFAULT now();

        -- Create wallet_transactions table
        CREATE TABLE IF NOT EXISTS public.wallet_transactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
          admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
          admin_name TEXT,
          action TEXT NOT NULL,
          amount NUMERIC NOT NULL,
          avail_before NUMERIC NOT NULL,
          avail_after NUMERIC NOT NULL,
          credit_before NUMERIC NOT NULL,
          credit_after NUMERIC NOT NULL,
          reason TEXT NOT NULL,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          ip_address TEXT
        );

        -- Enable RLS on wallet_transactions
        ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "user reads own wallet transactions" ON public.wallet_transactions;
        CREATE POLICY "user reads own wallet transactions" ON public.wallet_transactions
          FOR SELECT TO authenticated
          USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

        DROP POLICY IF EXISTS "admin writes wallet transactions" ON public.wallet_transactions;
        CREATE POLICY "admin writes wallet transactions" ON public.wallet_transactions
          FOR ALL TO authenticated
          USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

        -- Create user_notifications table
        CREATE TABLE IF NOT EXISTS public.user_notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          seen BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- Enable RLS on user_notifications
        ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "user reads own notifications" ON public.user_notifications;
        CREATE POLICY "user reads own notifications" ON public.user_notifications
          FOR SELECT TO authenticated
          USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "admin writes notifications" ON public.user_notifications;
        CREATE POLICY "admin writes notifications" ON public.user_notifications
          FOR ALL TO service_role;

        -- Grant permissions
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_transactions TO authenticated;
        GRANT ALL ON public.wallet_transactions TO service_role;

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notifications TO authenticated;
        GRANT ALL ON public.user_notifications TO service_role;

        -- Enable realtime for new tables
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'wallet_transactions'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'user_notifications'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
          END IF;
        END $$;

        ALTER TABLE public.wallet_transactions REPLICA IDENTITY FULL;
        ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;

        -- Notify PostgREST to reload its schema cache
        NOTIFY pgrst, 'reload schema';
      `;

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

      const sql = MIGRATIONS_SQL;

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
  .validator((d: { channelType: "rules" | "updates"; content: string; imageUrl?: string | null; audioUrl?: string | null }) => {
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
  .validator((d: { id: string }) => d)
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

export const runAutoDatabaseMigrations = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const sql = MIGRATIONS_SQL;
      const pg = (await import("pg")).default;
      
      const queryColumns = async (client: any) => {
        const res = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'groups' AND table_schema = 'public';
        `);
        return res.rows;
      };

      // Try process.env.DATABASE_URL first
      if (process.env.DATABASE_URL) {
        console.log("[AutoMigration] Found DATABASE_URL, attempting connection...");
        const client = new pg.Client({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes("supabase.co") || process.env.DATABASE_URL.includes("chancerealm.casino")
            ? { rejectUnauthorized: false }
            : undefined
        });
        try {
          await client.connect();
          console.log("[AutoMigration] Connected! Executing SQL...");
          await client.query(sql);
          const columns = await queryColumns(client);
          await client.end();
          console.log("[AutoMigration] SQL executed successfully! Columns:", columns);
          return { success: true, message: "Executed successfully via DATABASE_URL", columns };
        } catch (e: any) {
          console.warn("[AutoMigration] Connection failed:", e.message);
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
          console.log(`[AutoMigration] Trying connection to ${h}:${p}...`);
          const client = new pg.Client({
            connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
            ssl: h === "db.chancerealm.casino" || h === "db.gsnhqzsgptqxtlhggzkz.supabase.co" ? { rejectUnauthorized: false } : undefined
          });
          try {
            await client.connect();
            console.log(`[AutoMigration] Connected to ${h}:${p}! Executing SQL...`);
            await client.query(sql);
            const columns = await queryColumns(client);
            await client.end();
            console.log(`[AutoMigration] SQL executed successfully on ${h}:${p}! Columns:`, columns);
            return { success: true, message: `Executed successfully on ${h}:${p}`, columns };
          } catch (e: any) {
            console.warn(`[AutoMigration] Failed on ${h}:${p}:`, e.message);
            try { await client.end(); } catch {}
          }
        }
      }
      return { success: false, error: "Could not connect to database on any host/port configuration" };
    } catch (e: any) {
      console.error("[AutoMigration Catch Error]:", e);
      return { success: false, error: e.message };
    }
  });

// ==========================================
// ADMIN USER MANAGEMENT SERVER FUNCTIONS
// ==========================================

export const getUsersListAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    search?: string;
    filter?: "all" | "online" | "offline" | "verified" | "unverified" | "admins" | "super_admins" | "normal_users" | "recently_joined";
    sortBy?: "username" | "created_at" | "last_seen" | "role" | "status";
    sortDesc?: boolean;
    page: number;
    limit: number;
  }) => d)
  .handler(async ({ data, context }) => {
    // 1. Verify caller is admin or super admin
    const { data: callerRoles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (callerRoles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: allAdminRoles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const adminIds = (allAdminRoles ?? [])
      .filter((r: any) => r.role === "admin" || r.role === "super_admin")
      .map((r: any) => r.user_id);
    const superAdminIds = (allAdminRoles ?? [])
      .filter((r: any) => r.role === "super_admin")
      .map((r: any) => r.user_id);

    // 3. Build query
    let query = supabaseAdmin.from("profiles").select("*", { count: "exact" });

    // Search
    if (data.search?.trim()) {
      const s = data.search.trim();
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
      if (isUuid) {
        query = query.eq("id", s);
      } else {
        query = query.or(`username.ilike.%${s}%,email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
      }
    }

    // Filter
    if (data.filter && data.filter !== "all") {
      switch (data.filter) {
        case "online":
          query = query.eq("online", true);
          break;
        case "offline":
          query = query.eq("online", false);
          break;
        case "verified":
          query = query.eq("verified", true);
          break;
        case "unverified":
          query = query.eq("verified", false);
          break;
        case "admins":
          query = query.in("id", adminIds);
          break;
        case "super_admins":
          query = query.in("id", superAdminIds);
          break;
        case "normal_users":
          if (adminIds.length > 0) {
            query = query.not("id", "in", `(${adminIds.join(",")})`);
          }
          break;
        case "recently_joined":
          // Handled by sorting by default, but let's filter to past 30 days if wanted, or just default sorting
          break;
      }
    }

    // Sorting
    const sortField = data.sortBy || "created_at";
    const ascending = !data.sortDesc;
    
    // Sort logic
    if (sortField === "role") {
      // In Postgres, sorting by role isn't direct since roles are in a different table.
      // We will default to created_at sort on database and sort in memory if needed, or sorting by id.
      query = query.order("created_at", { ascending });
    } else {
      query = query.order(sortField, { ascending });
    }

    // Pagination
    const from = (data.page - 1) * data.limit;
    const to = from + data.limit - 1;
    query = query.range(from, to);

    const { data: users, count, error } = await query;
    if (error) throw new Error(error.message);

    if (!users || users.length === 0) {
      return { users: [], count: count ?? 0 };
    }

    const userIds = users.map((u: any) => u.id);

    // Fetch referral counts in one query
    const { data: refRows } = await supabaseAdmin
      .from("referrals")
      .select("referrer_id")
      .in("referrer_id", userIds);
    const refCountMap: Record<string, number> = {};
    (refRows ?? []).forEach((r: any) => {
      refCountMap[r.referrer_id] = (refCountMap[r.referrer_id] || 0) + 1;
    });

    // Map roles to each user
    const rolesMap = new Map<string, string>();
    (allAdminRoles ?? []).forEach((r: any) => {
      rolesMap.set(r.user_id, r.role);
    });

    const mappedUsers = users.map((u: any) => ({
      ...u,
      role: rolesMap.get(u.id) || "user",
      referral_count: refCountMap[u.id] || 0,
    }));

    return {
      users: mappedUsers,
      count: count ?? 0,
    };
  });

export const updateUserProfileAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    targetUserId: string;
    profileUpdates: {
      username?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      address?: string;
      bio?: string;
      avatar_url?: string | null;
      cover_photo?: string | null;
      coins?: number;
      xp?: number;
      wallet_balance?: number;
      vip_status?: string;
      theme?: string;
      language?: string;
      verified?: boolean;
      status?: string;
    };
    roleUpdate?: "user" | "admin" | "super_admin";
  }) => d)
  .handler(async ({ data, context }) => {
    // 1. Verify caller role
    const callerId = context.userId;
    const { data: callerRoles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", callerId);
    const callerRolesList = (callerRoles ?? []).map((r: any) => r.role);
    const isCallerSuperAdmin = callerRolesList.includes("super_admin");
    const isCallerAdmin = callerRolesList.includes("admin") || isCallerSuperAdmin;
    if (!isCallerAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch caller profile for audit log name
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles").select("username").eq("id", callerId).maybeSingle();
    const adminUsername = callerProfile?.username || "Admin";

    // 2. Fetch target user's current profile and role
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles").select("*").eq("id", data.targetUserId).maybeSingle();
    if (targetError || !targetProfile) throw new Error("Target user not found");

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.targetUserId);
    const targetRolesList = (targetRoles ?? []).map((r: any) => r.role);
    const isTargetSuperAdmin = targetRolesList.includes("super_admin");
    const isTargetAdmin = targetRolesList.includes("admin") || isTargetSuperAdmin;
    const targetRole = isTargetSuperAdmin ? "super_admin" : isTargetAdmin ? "admin" : "user";

    // 3. Security Boundary checks
    if (isTargetSuperAdmin) {
      throw new Error("Super admin accounts are read-only and cannot be modified.");
    }

    if (isTargetAdmin && !isCallerSuperAdmin) {
      throw new Error("Only super admins can modify administrator accounts.");
    }

    // Prepare updates
    const updates: any = { ...data.profileUpdates };

    // Synced status changes
    if (data.profileUpdates.status) {
      if (data.profileUpdates.status === "suspended" || data.profileUpdates.status === "banned") {
        updates.is_blocked = true;
      } else if (data.profileUpdates.status === "active") {
        updates.is_blocked = false;
      }
    }

    // Update target profile
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", data.targetUserId);
    if (updateError) throw new Error(updateError.message);

    // Handle role updates (only super admins can change roles)
    if (data.roleUpdate && data.roleUpdate !== targetRole) {
      if (!isCallerSuperAdmin) throw new Error("Only super admins can change user roles");
      
      // Delete existing roles
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);
      
      // If not "user", insert new role record
      if (data.roleUpdate !== "user") {
        await supabaseAdmin.from("user_roles").insert({
          user_id: data.targetUserId,
          role: data.roleUpdate,
        });
      }
    }

    // Write audit log
    await supabaseAdmin.from("activity_logs").insert({
      user_id: callerId,
      action: `Profile details updated for user: @${targetProfile.username} by admin @${adminUsername}`,
      details: {
        admin_id: callerId,
        admin_name: adminUsername,
        target_user_id: data.targetUserId,
        target_username: targetProfile.username,
        action: "update_profile",
        previous_values: {
          ...targetProfile,
          role: targetRole,
        },
        new_values: {
          ...updates,
          role: data.roleUpdate || targetRole,
        }
      } as any
    });

    return { ok: true };
  });

export const changeUserPasswordAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetUserId: string; newPassword?: string }) => {
    if (!d.newPassword || d.newPassword.length < 6) throw new Error("Password must be at least 6 characters");
    return d;
  })
  .handler(async ({ data, context }) => {
    const callerId = context.userId;
    const { data: callerRoles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", callerId);
    const callerRolesList = (callerRoles ?? []).map((r: any) => r.role);
    const isCallerSuperAdmin = callerRolesList.includes("super_admin");
    const isCallerAdmin = callerRolesList.includes("admin") || isCallerSuperAdmin;
    if (!isCallerAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch details
    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("username").eq("id", callerId).maybeSingle();
    const adminUsername = callerProfile?.username || "Admin";

    const { data: targetProfile } = await supabaseAdmin.from("profiles").select("username").eq("id", data.targetUserId).maybeSingle();
    if (!targetProfile) throw new Error("Target user not found");

    const { data: targetRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.targetUserId);
    const targetRolesList = (targetRoles ?? []).map((r: any) => r.role);
    const isTargetSuperAdmin = targetRolesList.includes("super_admin");
    const isTargetAdmin = targetRolesList.includes("admin") || isTargetSuperAdmin;

    if (isTargetSuperAdmin) {
      throw new Error("Super admin accounts are read-only and cannot be modified.");
    }

    if (isTargetAdmin && !isCallerSuperAdmin) {
      throw new Error("Only super admins can reset passwords for other administrator accounts.");
    }

    // Call Supabase Admin Auth API to change password directly without OTP
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);

    // Audit log
    await supabaseAdmin.from("activity_logs").insert({
      user_id: callerId,
      action: `Password reset for user @${targetProfile.username} by admin @${adminUsername}`,
      details: {
        admin_id: callerId,
        admin_name: adminUsername,
        target_user_id: data.targetUserId,
        target_username: targetProfile.username,
        action: "password_reset"
      } as any
    });

    return { ok: true };
  });

export const changeUserEmailAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetUserId: string; newEmail: string }) => {
    if (!d.newEmail?.trim()) throw new Error("Email is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const callerId = context.userId;
    const { data: callerRoles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", callerId);
    const callerRolesList = (callerRoles ?? []).map((r: any) => r.role);
    const isCallerSuperAdmin = callerRolesList.includes("super_admin");
    const isCallerAdmin = callerRolesList.includes("admin") || isCallerSuperAdmin;
    if (!isCallerAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch details
    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("username").eq("id", callerId).maybeSingle();
    const adminUsername = callerProfile?.username || "Admin";

    const { data: targetProfile } = await supabaseAdmin.from("profiles").select("username, email").eq("id", data.targetUserId).maybeSingle();
    if (!targetProfile) throw new Error("Target user not found");

    const { data: targetRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.targetUserId);
    const targetRolesList = (targetRoles ?? []).map((r: any) => r.role);
    const isTargetSuperAdmin = targetRolesList.includes("super_admin");
    const isTargetAdmin = targetRolesList.includes("admin") || isTargetSuperAdmin;

    if (isTargetSuperAdmin) {
      throw new Error("Super admin accounts are read-only and cannot be modified.");
    }

    if (isTargetAdmin && !isCallerSuperAdmin) {
      throw new Error("Only super admins can change emails for other administrator accounts.");
    }

    // Call Supabase Admin Auth API to change email directly without OTP
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
      email: data.newEmail,
      email_confirm: true
    });
    if (error) throw new Error(error.message);

    // Update email in profiles table to maintain sync
    await supabaseAdmin.from("profiles").update({ email: data.newEmail }).eq("id", data.targetUserId);

    // Audit log
    await supabaseAdmin.from("activity_logs").insert({
      user_id: callerId,
      action: `Email changed for user @${targetProfile.username} from ${targetProfile.email ?? "none"} to ${data.newEmail} by admin @${adminUsername}`,
      details: {
        admin_id: callerId,
        admin_name: adminUsername,
        target_user_id: data.targetUserId,
        target_username: targetProfile.username,
        action: "email_changed",
        previous_email: targetProfile.email,
        new_email: data.newEmail
      } as any
    });

    return { ok: true };
  });

export const deleteUserAccountAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetUserId: string }) => d)
  .handler(async ({ data, context }) => {
    const callerId = context.userId;
    const { data: callerRoles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", callerId);
    const callerRolesList = (callerRoles ?? []).map((r: any) => r.role);
    const isCallerSuperAdmin = callerRolesList.includes("super_admin");
    const isCallerAdmin = callerRolesList.includes("admin") || isCallerSuperAdmin;
    if (!isCallerAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch details
    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("username").eq("id", callerId).maybeSingle();
    const adminUsername = callerProfile?.username || "Admin";

    const { data: targetProfile } = await supabaseAdmin.from("profiles").select("username").eq("id", data.targetUserId).maybeSingle();
    if (!targetProfile) throw new Error("Target user not found");

    const { data: targetRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.targetUserId);
    const targetRolesList = (targetRoles ?? []).map((r: any) => r.role);
    const isTargetSuperAdmin = targetRolesList.includes("super_admin");
    const isTargetAdmin = targetRolesList.includes("admin") || isTargetSuperAdmin;

    if (isTargetSuperAdmin) {
      throw new Error("Super admin accounts are read-only and cannot be modified.");
    }

    if (isTargetAdmin && !isCallerSuperAdmin) {
      throw new Error("Only super admins can delete administrator accounts.");
    }

    // Delete user from auth and cascade delete profile
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (error) throw new Error(error.message);

    // Manually delete profile from profiles table just to be sure
    await supabaseAdmin.from("profiles").delete().eq("id", data.targetUserId);

    // Audit log
    await supabaseAdmin.from("activity_logs").insert({
      user_id: callerId,
      action: `Account deleted for user @${targetProfile.username} by admin @${adminUsername}`,
      details: {
        admin_id: callerId,
        admin_name: adminUsername,
        target_user_id: data.targetUserId,
        target_username: targetProfile.username,
        action: "delete_account"
      } as any
    });

    return { ok: true };
  });

