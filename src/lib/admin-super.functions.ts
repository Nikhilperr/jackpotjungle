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
  .validator((d: {
    content: string;
    targetType: "all" | "tag" | "selected";
    tagId?: string;
    userIds?: string[];
    skipUserIds?: string[];
    skipVipStatuses?: string[];
  }) => {
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
    if (data.skipUserIds && data.skipUserIds.length > 0) {
      targetIds = targetIds.filter((id) => !data.skipUserIds!.includes(id));
    }
    if (data.skipVipStatuses && data.skipVipStatuses.length > 0) {
      const { data: vips } = await supabaseAdmin
        .from("profiles")
        .select("id, vip_status")
        .in("id", targetIds);
      if (vips) {
        const skippedIds = vips
          .filter((v: any) => data.skipVipStatuses!.includes(v.vip_status))
          .map((v: any) => v.id);
        targetIds = targetIds.filter((id) => !skippedIds.includes(id));
      }
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

        -- Alter wallet_transactions to support auditing and soft-deletion
        ALTER TABLE public.wallet_transactions 
          ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS original_amount NUMERIC,
          ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

        -- Create system_settings table if not exists
        CREATE TABLE IF NOT EXISTS public.system_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
        GRANT ALL ON public.system_settings TO service_role;

        ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "admins manage system_settings" ON public.system_settings;
        CREATE POLICY "admins manage system_settings" ON public.system_settings FOR ALL TO authenticated
          USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
          WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

        DROP POLICY IF EXISTS "authenticated read system_settings" ON public.system_settings;
        CREATE POLICY "authenticated read system_settings" ON public.system_settings FOR SELECT TO authenticated
          USING (true);

        INSERT INTO public.system_settings (key, value)
        VALUES (
          'reengagement_campaign',
          '{"enabled": true, "inactivity_days": 3, "message_template": "🎰 Hi {PlayerName}!\\n\\n👋 It''s been a little while since we last saw you.\\n\\n🎁 We''ve missed you!\\n\\nCome back and check out today''s promotions and exciting games.\\n\\nGood luck,\\n\\n✨ Jackpot Jungle Team"}'
        )
        ON CONFLICT (key) DO NOTHING;

        -- Create vip_reward_settings table
        CREATE TABLE IF NOT EXISTS public.vip_reward_settings (
          id BOOLEAN PRIMARY KEY DEFAULT TRUE CONSTRAINT one_row CHECK (id = TRUE),
          reward_pool_percentage NUMERIC NOT NULL DEFAULT 5.0 CHECK (reward_pool_percentage >= 0 AND reward_pool_percentage <= 100),
          deposit_weight NUMERIC NOT NULL DEFAULT 35.0 CHECK (deposit_weight >= 0),
          holding_weight NUMERIC NOT NULL DEFAULT 30.0 CHECK (holding_weight >= 0),
          referral_weight NUMERIC NOT NULL DEFAULT 15.0 CHECK (referral_weight >= 0),
          loyalty_weight NUMERIC NOT NULL DEFAULT 20.0 CHECK (loyalty_weight >= 0),
          reward_cap_percentage NUMERIC NOT NULL DEFAULT 10.0 CHECK (reward_cap_percentage >= 0 AND reward_cap_percentage <= 100),
          min_monthly_deposit NUMERIC NOT NULL DEFAULT 100.0 CHECK (min_monthly_deposit >= 0),
          min_holding_requirement NUMERIC NOT NULL DEFAULT 50.0 CHECK (min_holding_requirement >= 0),
          distribution_date INTEGER NOT NULL DEFAULT 1 CHECK (distribution_date >= 1 AND distribution_date <= 28),
          vip_multipliers JSONB NOT NULL DEFAULT '{"bronze": 1.00, "silver": 1.05, "gold": 1.10, "platinum": 1.20, "diamond": 1.30, "black_diamond": 1.50}',
          referral_qualification_rules JSONB NOT NULL DEFAULT '{"min_referred_deposit": 50.0, "requires_verification": false}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
          CONSTRAINT weights_sum_100 CHECK (deposit_weight + holding_weight + referral_weight + loyalty_weight = 100)
        );

        -- Enable RLS
        ALTER TABLE public.vip_reward_settings ENABLE ROW LEVEL SECURITY;

        -- Create super_admin policy
        DROP POLICY IF EXISTS "super_admins_all_vip_settings" ON public.vip_reward_settings;
        CREATE POLICY "super_admins_all_vip_settings" ON public.vip_reward_settings
          FOR ALL TO authenticated
          USING (public.has_role(auth.uid(), 'super_admin'));

        -- Seed default configuration
        INSERT INTO public.vip_reward_settings (
          id, reward_pool_percentage, deposit_weight, holding_weight, referral_weight, loyalty_weight,
          reward_cap_percentage, min_monthly_deposit, min_holding_requirement, distribution_date,
          vip_multipliers, referral_qualification_rules
        ) VALUES (
          TRUE, 5.0, 35.0, 30.0, 15.0, 20.0, 10.0, 100.0, 50.0, 1,
          '{"bronze": 1.00, "silver": 1.05, "gold": 1.10, "platinum": 1.20, "diamond": 1.30, "black_diamond": 1.50}',
          '{"min_referred_deposit": 50.0, "requires_verification": false}'
        )
        ON CONFLICT (id) DO NOTHING;

        -- Grant permissions
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_reward_settings TO authenticated;
        GRANT ALL ON public.vip_reward_settings TO service_role;

        -- Add table to publication if not already added
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'vip_reward_settings'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_reward_settings;
          END IF;
        END $$;

        -- Create vip_reward_runs table
        CREATE TABLE IF NOT EXISTS public.vip_reward_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
          year INTEGER NOT NULL,
          reward_pool NUMERIC NOT NULL CHECK (reward_pool >= 0),
          status VARCHAR NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Calculated', 'Pending Review', 'Approved', 'Processing', 'Completed', 'Rejected', 'Locked')),
          total_qualified_users INTEGER NOT NULL DEFAULT 0,
          total_distributed_rewards NUMERIC NOT NULL DEFAULT 0,
          configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
          player_results JSONB NOT NULL DEFAULT '[]'::jsonb,
          logs TEXT[] NOT NULL DEFAULT '{}'::text[],
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
          approved_at TIMESTAMPTZ,
          approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
          locked_at TIMESTAMPTZ,
          CONSTRAINT unique_month_year UNIQUE (month, year)
        );

        -- Enable RLS
        ALTER TABLE public.vip_reward_runs ENABLE ROW LEVEL SECURITY;

        -- Create policy for super_admin
        DROP POLICY IF EXISTS "super_admins_all_vip_runs" ON public.vip_reward_runs;
        CREATE POLICY "super_admins_all_vip_runs" ON public.vip_reward_runs
          FOR ALL TO authenticated
          USING (public.has_role(auth.uid(), 'super_admin'));

        -- Grant permissions
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_reward_runs TO authenticated;
        GRANT ALL ON public.vip_reward_runs TO service_role;

        -- Add table to publication if not already added
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'vip_reward_runs'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_reward_runs;
          END IF;
        END $$;

        -- Ensure vip_reward_settings table has run_time and timezone columns
        ALTER TABLE public.vip_reward_settings ADD COLUMN IF NOT EXISTS run_time VARCHAR NOT NULL DEFAULT '00:00';
        ALTER TABLE public.vip_reward_settings ADD COLUMN IF NOT EXISTS timezone VARCHAR NOT NULL DEFAULT 'America/New_York';

        -- Stored Procedure to safely, atomically execute payouts inside a database transaction
        CREATE OR REPLACE FUNCTION public.execute_vip_payouts(
          run_uuid UUID,
          admin_uuid UUID,
          admin_name_text TEXT
        )
        RETURNS JSONB AS $$
        DECLARE
          v_run RECORD;
          v_player RECORD;
          v_prev_avail NUMERIC;
          v_prev_credit NUMERIC;
          v_next_avail NUMERIC;
          v_month_name TEXT;
        BEGIN
          -- 1. Fetch and lock run row
          SELECT * INTO v_run FROM public.vip_reward_runs WHERE id = run_uuid FOR UPDATE;
          
          IF NOT FOUND THEN
            RAISE EXCEPTION 'VIP Reward run not found.';
          END IF;

          IF v_run.status <> 'Approved' THEN
            RAISE EXCEPTION 'Cannot execute payouts: Run is not approved.';
          END IF;

          -- Update status to Processing to block concurrent attempts
          UPDATE public.vip_reward_runs SET status = 'Processing' WHERE id = run_uuid;

          -- Get month name
          SELECT to_char(to_date(v_run.month::text, 'MM'), 'Month') INTO v_month_name;
          v_month_name := trim(v_month_name);

          -- 2. Process qualified player credits
          FOR v_player IN SELECT * FROM jsonb_to_recordset(v_run.player_results) AS x(
            user_id UUID,
            username TEXT,
            vip_status TEXT,
            deposit_score NUMERIC,
            holding_score NUMERIC,
            referral_score NUMERIC,
            loyalty_score NUMERIC,
            base_score NUMERIC,
            multiplier NUMERIC,
            final_score NUMERIC,
            final_reward NUMERIC,
            qualified BOOLEAN
          ) LOOP
            IF v_player.qualified = TRUE AND v_player.final_reward > 0 THEN
              -- Check if user has already been paid for this run to avoid duplicates and allow resuming
              IF EXISTS (
                SELECT 1 FROM public.vip_player_rewards 
                WHERE run_id = run_uuid AND user_id = v_player.user_id
              ) THEN
                CONTINUE;
              END IF;

              -- Fetch and lock profile row
              SELECT wallet_balance, credit_balance INTO v_prev_avail, v_prev_credit 
              FROM public.profiles WHERE id = v_player.user_id FOR UPDATE;

              IF FOUND THEN
                v_next_avail := v_prev_avail + v_player.final_reward;

                -- Update profile
                UPDATE public.profiles SET 
                  wallet_balance = v_next_avail, 
                  wallet_last_updated = now() 
                WHERE id = v_player.user_id;

                -- Insert transaction record
                INSERT INTO public.wallet_transactions (
                  user_id, admin_id, admin_name, action, amount,
                  avail_before, avail_after, credit_before, credit_after,
                  reason, notes
                ) VALUES (
                  v_player.user_id, admin_uuid, admin_name_text, 'bonus', v_player.final_reward,
                  v_prev_avail, v_next_avail, v_prev_credit, v_prev_credit,
                  'VIP Loyalty Payout - ' || v_month_name || ' ' || v_run.year::text,
                  'Automatically distributed after Super Admin approval.'
                );

                -- Insert user notification
                INSERT INTO public.user_notifications (user_id, title, content)
                VALUES (
                  v_player.user_id,
                  'VIP Loyalty Payout',
                  'You received a loyalty bonus of $' || to_char(v_player.final_reward, 'FM999,999,990.00') || ' into your Available Balance.'
                );

                -- Insert player reward history record
                INSERT INTO public.vip_player_rewards (
                  run_id, user_id, username, month, year, vip_status,
                  deposit_score, holding_score, referral_score, loyalty_score,
                  base_score, multiplier, final_score, reward_amount,
                  distribution_date, approval_status
                ) VALUES (
                  run_uuid, v_player.user_id, v_player.username, v_run.month, v_run.year, COALESCE(v_player.vip_status, 'none'),
                  COALESCE(v_player.deposit_score, 0), COALESCE(v_player.holding_score, 0), COALESCE(v_player.referral_score, 0), COALESCE(v_player.loyalty_score, 0),
                  COALESCE(v_player.base_score, 0), COALESCE(v_player.multiplier, 1.0), COALESCE(v_player.final_score, 0), v_player.final_reward,
                  now(), 'Completed'
                );
              END IF;
            END IF;
          END LOOP;

          -- Update status to Completed
          UPDATE public.vip_reward_runs SET 
            status = 'Completed',
            approved_at = now(),
            approved_by = admin_uuid,
            updated_at = now(),
            updated_by = admin_uuid
          WHERE id = run_uuid;

          RETURN jsonb_build_object(
            'success', true,
            'message', 'Payout execution completed successfully.'
          );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- Create public.vip_player_rewards table
        CREATE TABLE IF NOT EXISTS public.vip_player_rewards (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          run_id UUID NOT NULL REFERENCES public.vip_reward_runs(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
          username VARCHAR NOT NULL,
          month INTEGER NOT NULL,
          year INTEGER NOT NULL,
          vip_status VARCHAR NOT NULL,
          deposit_score NUMERIC NOT NULL,
          holding_score NUMERIC NOT NULL,
          referral_score NUMERIC NOT NULL,
          loyalty_score NUMERIC NOT NULL,
          base_score NUMERIC NOT NULL,
          multiplier NUMERIC NOT NULL,
          final_score NUMERIC NOT NULL,
          reward_amount NUMERIC NOT NULL,
          distribution_date TIMESTAMPTZ NOT NULL,
          approval_status VARCHAR NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT unique_run_user UNIQUE (run_id, user_id)
        );

        -- Ensure unique constraint exists on older tables
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'unique_run_user'
          ) THEN
            ALTER TABLE public.vip_player_rewards ADD CONSTRAINT unique_run_user UNIQUE (run_id, user_id);
          END IF;
        END $$;

        -- Enable RLS on vip_player_rewards
        ALTER TABLE public.vip_player_rewards ENABLE ROW LEVEL SECURITY;

        -- Policies for vip_player_rewards
        DROP POLICY IF EXISTS "user_view_own_vip_player_rewards" ON public.vip_player_rewards;
        CREATE POLICY "user_view_own_vip_player_rewards" ON public.vip_player_rewards
          FOR SELECT TO authenticated
          USING (
            auth.uid() = user_id OR
            public.has_role(auth.uid(), 'super_admin'::app_role) OR
            public.has_role(auth.uid(), 'admin'::app_role)
          );

        -- Create public.vip_audit_logs table
        CREATE TABLE IF NOT EXISTS public.vip_audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
          username VARCHAR NOT NULL,
          role VARCHAR NOT NULL,
          action VARCHAR NOT NULL,
          previous_value JSONB,
          new_value JSONB,
          ip_address VARCHAR,
          device_info VARCHAR
        );

        -- Enable RLS on vip_audit_logs
        ALTER TABLE public.vip_audit_logs ENABLE ROW LEVEL SECURITY;

        -- Policies for vip_audit_logs: only admins/super admins can select
        DROP POLICY IF EXISTS "admins_view_all_vip_audit_logs" ON public.vip_audit_logs;
        CREATE POLICY "admins_view_all_vip_audit_logs" ON public.vip_audit_logs
          FOR SELECT TO authenticated
          USING (
            public.has_role(auth.uid(), 'super_admin'::app_role) OR
            public.has_role(auth.uid(), 'admin'::app_role)
          );

        -- Grant permissions
        GRANT SELECT ON public.vip_player_rewards TO authenticated;
        GRANT ALL ON public.vip_player_rewards TO service_role;

        GRANT SELECT ON public.vip_audit_logs TO authenticated;
        GRANT ALL ON public.vip_audit_logs TO service_role;

        -- Add tables to realtime publication if not already present
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'vip_player_rewards'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_player_rewards;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'vip_audit_logs'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_audit_logs;
          END IF;
        END $$;

        -- Add permissions column to user_roles
        ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS permissions TEXT[];

        -- Set default permissions for existing admins & super admins if they are null
        UPDATE public.user_roles 
        SET permissions = ARRAY['inbox', 'aichat', 'teamchat', 'referrals', 'users', 'monitor', 'profile'] 
        WHERE role IN ('admin', 'super_admin') AND permissions IS NULL;

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
            : undefined,
          connectionTimeoutMillis: 1500
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

      const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD || "grootMahakal7X";
      const dbName = process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres";
      const username = process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres";

      const configuredHost = process.env.SUPABASE_DB_HOST || process.env.DATABASE_HOST;
      const hosts = configuredHost ? [configuredHost] : ["localhost", "127.0.0.1", "db.gsnhqzsgptqxtlhggzkz.supabase.co", "db.chancerealm.casino", "db"];

      const configuredPort = process.env.SUPABASE_DB_PORT || process.env.DATABASE_PORT;
      const ports = configuredPort ? [parseInt(configuredPort, 10)] : [5432, 6543];

      for (const h of hosts) {
        for (const p of ports) {
          const isRemote = h.includes(".") && !h.startsWith("127.");
          const sslVal = process.env.DATABASE_SSL === "true" || (process.env.DATABASE_SSL !== "false" && isRemote);
          
          let client = new pg.Client({
            connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
            ssl: sslVal ? { rejectUnauthorized: false } : undefined,
            connectionTimeoutMillis: 1500
          });
          let success = false;
          try {
            console.log(`[Migration] Trying connection to ${h}:${p} (SSL: ${sslVal})...`);
            await client.connect();
            success = true;
          } catch (e: any) {
            console.warn(`[Migration] Failed on ${h}:${p} with SSL:`, e.message);
            try { await client.end(); } catch {}
            
            if (sslVal) {
              console.log(`[Migration] Retrying connection to ${h}:${p} WITHOUT SSL...`);
              client = new pg.Client({
                connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
                ssl: undefined,
                connectionTimeoutMillis: 1500
              });
              try {
                await client.connect();
                success = true;
              } catch (e2: any) {
                console.warn(`[Migration] Failed on ${h}:${p} without SSL:`, e2.message);
                try { await client.end(); } catch {}
              }
            }
          }

          if (success) {
            try {
              console.log(`[Migration] Connected to ${h}:${p}! Executing SQL...`);
              await client.query(sql);
              await client.end();
              console.log(`[Migration] SQL executed successfully on ${h}:${p}!`);
              return { success: true, message: `Executed successfully on ${h}:${p}` };
            } catch (err: any) {
              console.error(`[Migration] Query execution failed:`, err.message);
              try { await client.end(); } catch {}
            }
          }
        }
      }
      return { success: false, error: "Could not connect to database on any host/port configuration. Please check your env parameters: DATABASE_URL, SUPABASE_DB_PASSWORD, or DATABASE_PASSWORD." };
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

      const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD || "grootMahakal7X";
      const dbName = process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres";
      const username = process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres";

      const configuredHost = process.env.SUPABASE_DB_HOST || process.env.DATABASE_HOST;
      const hosts = configuredHost ? [configuredHost] : ["localhost", "127.0.0.1", "db.gsnhqzsgptqxtlhggzkz.supabase.co", "db.chancerealm.casino", "db"];

      const configuredPort = process.env.SUPABASE_DB_PORT || process.env.DATABASE_PORT;
      const ports = configuredPort ? [parseInt(configuredPort, 10)] : [5432, 6543];

      for (const h of hosts) {
        for (const p of ports) {
          const isRemote = h.includes(".") && !h.startsWith("127.");
          const sslVal = process.env.DATABASE_SSL === "true" || (process.env.DATABASE_SSL !== "false" && isRemote);
          
          let client = new pg.Client({
            connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
            ssl: sslVal ? { rejectUnauthorized: false } : undefined
          });
          let success = false;
          try {
            console.log(`[AutoMigration] Trying connection to ${h}:${p} (SSL: ${sslVal})...`);
            await client.connect();
            success = true;
          } catch (e: any) {
            console.warn(`[AutoMigration] Failed on ${h}:${p} with SSL:`, e.message);
            try { client.end(); } catch {}
            
            if (sslVal) {
              console.log(`[AutoMigration] Retrying connection to ${h}:${p} WITHOUT SSL...`);
              client = new pg.Client({
                connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
                ssl: undefined
              });
              try {
                await client.connect();
                success = true;
              } catch (e2: any) {
                console.warn(`[AutoMigration] Failed on ${h}:${p} without SSL:`, e2.message);
                try { client.end(); } catch {}
              }
            }
          }

          if (success) {
            try {
              console.log(`[AutoMigration] Connected to ${h}:${p}! Executing SQL...`);
              await client.query(sql);
              const columns = await queryColumns(client);
              await client.end();
              console.log(`[AutoMigration] SQL executed successfully on ${h}:${p}! Columns:`, columns);
              return { success: true, message: `Executed successfully on ${h}:${p}`, columns };
            } catch (err: any) {
              console.error(`[AutoMigration] Query execution failed:`, err.message);
              try { client.end(); } catch {}
            }
          }
        }
      }
      return { success: false, error: "Could not connect to database on any host/port configuration. Please check your env parameters: DATABASE_URL, SUPABASE_DB_PASSWORD, or DATABASE_PASSWORD." };
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

    let allAdminRoles: any[] | null = null;
    try {
      const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role, permissions");
      if (error) {
        console.warn("getUsersListAdmin roles query error (might not exist yet):", error);
        if (error.code === "42703" || error.message?.includes("permissions")) {
          const fallback = await supabaseAdmin
            .from("user_roles")
            .select("user_id, role");
          if (fallback.error) {
            console.error("getUsersListAdmin fallback query failed:", fallback.error);
          } else {
            allAdminRoles = fallback.data;
          }
        }
      } else {
        allAdminRoles = data;
      }
    } catch (err) {
      console.error("Exception fetching all user roles:", err);
    }

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

    // Map roles & permissions to each user
    const rolesMap = new Map<string, string>();
    const permissionsMap = new Map<string, string[]>();
    (allAdminRoles ?? []).forEach((r: any) => {
      rolesMap.set(r.user_id, r.role);
      permissionsMap.set(r.user_id, r.permissions || []);
    });

    const mappedUsers = users.map((u: any) => ({
      ...u,
      role: rolesMap.get(u.id) || "user",
      permissions: permissionsMap.get(u.id) || [],
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
    permissionsUpdate?: string[];
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

    // Handle role & permissions updates (only super admins can change roles/permissions)
    if (isCallerSuperAdmin) {
      if (data.roleUpdate && data.roleUpdate !== targetRole) {
        // Delete existing roles
        const { error: deleteError } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);
        if (deleteError) throw new Error(deleteError.message);
        
        // If not "user", insert new role record
        if (data.roleUpdate !== "user") {
          const insertPayload: any = {
            user_id: data.targetUserId,
            role: data.roleUpdate
          };
          if (data.roleUpdate === "admin" && data.permissionsUpdate) {
            insertPayload.permissions = data.permissionsUpdate;
          }
          
          const { error: insertError } = await supabaseAdmin.from("user_roles").insert(insertPayload);
          if (insertError) {
            console.warn("Failed to insert user role with permissions:", insertError);
            if (insertError.code === "42703" || insertError.message?.includes("permissions")) {
              // Fallback: try inserting without permissions column
              delete insertPayload.permissions;
              const { error: fallbackError } = await supabaseAdmin.from("user_roles").insert(insertPayload);
              if (fallbackError) throw new Error(fallbackError.message);
            } else {
              throw new Error(insertError.message);
            }
          }
        }
      } else if (data.permissionsUpdate && (targetRole === "admin" || targetRole === "super_admin")) {
        // Update permissions for existing admin role
        const { error: updateError } = await supabaseAdmin
          .from("user_roles")
          .update({ permissions: data.permissionsUpdate })
          .eq("user_id", data.targetUserId)
          .eq("role", targetRole);
        if (updateError) {
          console.warn("Failed to update user role permissions:", updateError);
          if (updateError.code !== "42703" && !updateError.message?.includes("permissions")) {
            throw new Error(updateError.message);
          }
        }
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

export const getAllEmailsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: callerRoles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (callerRoles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: allRoles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const rolesMap: Record<string, string> = {};
    (allRoles ?? []).forEach((r: any) => {
      rolesMap[r.user_id] = r.role;
    });

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, username, first_name, last_name, created_at");

    if (error) throw new Error(error.message);

    const list = (profiles ?? []).map((p: any) => ({
      email: p.email || "",
      username: p.username || "",
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.username || "User",
      role: rolesMap[p.id] || "user",
      created_at: p.created_at
    }));

    return { list };
  });

export const getMonitorConversationsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: callerRoles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (callerRoles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, username, first_name, last_name, avatar_url, online, last_seen");
    if (profErr) throw profErr;

    const profilesMap: Record<string, any> = {};
    (profiles ?? []).forEach(p => {
      profilesMap[p.id] = {
        id: p.id,
        username: p.username,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.username || "User",
        avatar_url: p.avatar_url,
        online: p.online,
        last_seen: p.last_seen
      };
    });

    const { data: groups, error: grpErr } = await supabaseAdmin
      .from("groups")
      .select("id, name, avatar_url, created_at, is_admin_team");
    if (grpErr) throw grpErr;

    const { data: messages, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("id, sender_id, receiver_id, group_id, content, image_url, audio_url, created_at")
      .order("created_at", { ascending: false })
      .limit(3000);
    if (msgErr) throw msgErr;

    const conversationMap = new Map<string, any>();

    (messages ?? []).forEach(m => {
      if (m.group_id) {
        const key = `group-${m.group_id}`;
        if (!conversationMap.has(key)) {
          const groupInfo = (groups ?? []).find(g => g.id === m.group_id);
          if (groupInfo) {
            conversationMap.set(key, {
              id: key,
              type: "group",
              groupId: m.group_id,
              name: groupInfo.name,
              avatar_url: groupInfo.avatar_url,
              is_admin_team: groupInfo.is_admin_team,
              last_message: m.content || (m.image_url ? "[Image]" : m.audio_url ? "[Voice Message]" : ""),
              last_at: m.created_at
            });
          }
        }
      } else if (m.sender_id && m.receiver_id) {
        const userA = m.sender_id < m.receiver_id ? m.sender_id : m.receiver_id;
        const userB = m.sender_id < m.receiver_id ? m.receiver_id : m.sender_id;
        const key = `direct-${userA}-${userB}`;

        if (!conversationMap.has(key)) {
          const profileA = profilesMap[userA];
          const profileB = profilesMap[userB];
          if (profileA && profileB) {
            conversationMap.set(key, {
              id: key,
              type: "direct",
              userA: profileA,
              userB: profileB,
              name: `${profileA.name} & ${profileB.name}`,
              avatar_url: null,
              last_message: m.content || (m.image_url ? "[Image]" : m.audio_url ? "[Voice Message]" : ""),
              last_at: m.created_at
            });
          }
        }
      }
    });

    (groups ?? []).forEach(g => {
      const key = `group-${g.id}`;
      if (!conversationMap.has(key)) {
        conversationMap.set(key, {
          id: key,
          type: "group",
          groupId: g.id,
          name: g.name,
          avatar_url: g.avatar_url,
          is_admin_team: g.is_admin_team,
          last_message: "No messages yet",
          last_at: g.created_at
        });
      }
    });

    const list = Array.from(conversationMap.values());
    list.sort((a, b) => {
      const timeA = a.last_at ? new Date(a.last_at).getTime() : 0;
      const timeB = b.last_at ? new Date(b.last_at).getTime() : 0;
      return timeB - timeA;
    });

    return { list };
  });

export const getMonitorMessagesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: callerRoles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (callerRoles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let messages: any[] = [];
    if (data.type === "group") {
      const { data: grpMsgs, error } = await supabaseAdmin
        .from("messages")
        .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)")
        .eq("group_id", data.groupId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      messages = grpMsgs ?? [];
    } else {
      const { data: dirMsgs, error } = await supabaseAdmin
        .from("messages")
        .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)")
        .or(`and(sender_id.eq.${data.userA},receiver_id.eq.${data.userB}),and(sender_id.eq.${data.userB},receiver_id.eq.${data.userA})`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      messages = dirMsgs ?? [];
    }

    return { messages };
  });

export async function getDbClient() {
  console.log("[DB_DEBUG] getDbClient called.");
  const pg = (await import("pg")).default;
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("[DB_DEBUG] DATABASE_URL is not set, falling back to individual env variables.");
    const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD || "grootMahakal7X";
    const dbName = process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres";
    const username = process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres";
    const host = process.env.SUPABASE_DB_HOST || process.env.DATABASE_HOST || "localhost";
    const port = process.env.SUPABASE_DB_PORT || process.env.DATABASE_PORT || "5432";
    connectionString = `postgres://${username}:${dbPassword}@${host}:${port}/${dbName}`;
  }

  // Parse PostgreSQL config supporting both URI and Key-Value formats
  function parsePostgresConfig(connStr: string) {
    let host = "";
    let port = "5432";
    let user = "postgres";
    let password = "";
    let database = "postgres";

    if (connStr.includes("://")) {
      try {
        const url = new URL(connStr);
        host = url.hostname;
        port = url.port || "5432";
        user = url.username;
        password = url.password;
        database = url.pathname.replace(/^\//, "");
      } catch (e) {
        console.log("[DB_DEBUG] URI parsing threw error:", e.message);
      }
    } else {
      console.log("[DB_DEBUG] Parsing as key-value string.");
      const pairs = connStr.split(/\s+/);
      for (const pair of pairs) {
        const [k, v] = pair.split("=");
        if (k && v) {
          const cleanV = v.replace(/(^["']|["']$)/g, "");
          if (k === "host") host = cleanV;
          else if (k === "port") port = cleanV;
          else if (k === "user") user = cleanV;
          else if (k === "password") password = cleanV;
          else if (k === "dbname") database = cleanV;
        }
      }
    }
    return { host, port, user, password, database };
  }

  const config = parsePostgresConfig(connectionString);
  
  // Scan filesystem for potential database passwords/credentials configured on the VPS
  const fs = await import("fs");
  const path = await import("path");
  const candidatePasswords = new Set<string>();

  // Add default fallbacks
  candidatePasswords.add("grootMahakal7X");
  const envPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD;
  if (envPassword) candidatePasswords.add(envPassword);

  const cwd = process.cwd();
  console.log(`[DB_DEBUG] Scanning directory: ${cwd} for configuration files.`);

  const possiblePaths = [
    path.join(cwd, ".env"),
    path.join(cwd, "supabase", "docker", ".env"),
    path.join(cwd, "..", "supabase", "docker", ".env"),
    path.join(cwd, "..", ".env"),
    path.join(cwd, "..", "app", "supabase", "docker", ".env"),
    "/home/deploy/app/supabase/docker/.env",
    "/home/deploy/supabase/docker/.env",
    "/home/deploy/app/.env",
    "/home/deploy/.env"
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8");
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
          const [k, ...vParts] = trimmed.split("=");
          const val = vParts.join("=").trim().replace(/(^["']|["']$)/g, "");
          const keyUpper = k.trim().toUpperCase();
          if (
            keyUpper.includes("PASSWORD") ||
            keyUpper.includes("PASS") ||
            keyUpper.includes("KEY") ||
            keyUpper.includes("SECRET")
          ) {
            if (val && val.length > 3) {
              candidatePasswords.add(val);
              console.log(`[DB_DEBUG] Found password candidate in ${path.basename(p)}`);
            }
          }
          if (keyUpper === "DATABASE_URL" || keyUpper === "SUPABASE_DB_URL") {
            try {
              const urlMatch = val.match(/postgres:\/\/([^:]+):([^@]+)@/);
              if (urlMatch) {
                candidatePasswords.add(urlMatch[2]);
                console.log("[DB_DEBUG] Found password candidate in DATABASE_URL");
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      console.log(`[DB_DEBUG] File read error on ${p}: ${e.message}`);
    }
  }

  const possibleDockerComposePaths = [
    path.join(cwd, "supabase", "docker", "docker-compose.yml"),
    path.join(cwd, "..", "supabase", "docker", "docker-compose.yml"),
    "/home/deploy/app/supabase/docker/docker-compose.yml",
    "/home/deploy/supabase/docker/docker-compose.yml"
  ];

  for (const p of possibleDockerComposePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8");
        const matches = content.match(/POSTGRES_PASSWORD:\s*([^\s#]+)/g) || content.match(/password:\s*([^\s#]+)/g);
        if (matches) {
          for (const match of matches) {
            const val = match.split(":")[1].trim().replace(/(^["']|["']$)/g, "");
            if (val && val.length > 3) {
              candidatePasswords.add(val);
              console.log(`[DB_DEBUG] Found password candidate in docker-compose: ${val}`);
            }
          }
        }
      }
    } catch (e: any) {
      console.log(`[DB_DEBUG] Docker-compose read error on ${p}: ${e.message}`);
    }
  }

  const candidates: Array<{
    host: string;
    port: string;
    user: string;
    ssl: any;
    label: string;
  }> = [];

  const isLocalConfig = config.host === "localhost" || config.host === "127.0.0.1" || config.host === "db";

  // Scan candidates across possible hosts
  const hostsToTry = [config.host];
  if (isLocalConfig) {
    hostsToTry.push("db.chancerealm.casino");
    hostsToTry.push("db.gsnhqzsgptqxtlhggzkz.supabase.co");
  }

  for (const h of hostsToTry) {
    const isRemote = h !== "localhost" && h !== "127.0.0.1" && h !== "db";
    const ports = isRemote ? ["5432", "6543"] : ["5432", "54322"];

    for (const p of ports) {
      // Determine possible project refs to try for this host
      const projectRefs = [
        "gsnhqzsgptqxtlhggzkz",
        "your-tenant-id",
        "local",
        "default",
        "supabase",
        "local-project-ref",
        "chancerealm",
        "jackpotjungle"
      ];
      const match = h.match(/^db\.([a-z0-9]+)\.supabase\.(co|net)$/i);
      if (match) {
        projectRefs.unshift(match[1]);
      }
      const envRef = process.env.SUPABASE_PROJECT_ID || process.env.VITE_SUPABASE_PROJECT_ID;
      if (envRef) {
        projectRefs.unshift(envRef);
      }

      // Add "self-hosted" as fallback for local host
      if (!isRemote) {
        projectRefs.push("self-hosted");
      }

      // Remove duplicate project refs
      const uniqueRefs = Array.from(new Set(projectRefs));

      for (const ref of uniqueRefs) {
        const baseUser = config.user.split(".")[0];
        
        if (isRemote) {
          // 1. SSL with suffix
          candidates.push({
            host: h,
            port: p,
            user: `${baseUser}.${ref}`,
            ssl: { rejectUnauthorized: false, servername: `db.${ref}.supabase.co` },
            label: `Remote SSL (${h}:${p} as ${baseUser}.${ref})`
          });

          // 2. Non-SSL with suffix
          candidates.push({
            host: h,
            port: p,
            user: `${baseUser}.${ref}`,
            ssl: undefined,
            label: `Remote Non-SSL (${h}:${p} as ${baseUser}.${ref})`
          });

          // 3. SSL without suffix
          candidates.push({
            host: h,
            port: p,
            user: baseUser,
            ssl: { rejectUnauthorized: false, servername: h },
            label: `Remote SSL No-Suffix (${h}:${p} as ${baseUser})`
          });

          // 4. Non-SSL without suffix
          candidates.push({
            host: h,
            port: p,
            user: baseUser,
            ssl: undefined,
            label: `Remote Non-SSL No-Suffix (${h}:${p} as ${baseUser})`
          });
        } else {
          // Local candidates
          // Try with tenant suffix
          candidates.push({
            host: h,
            port: p,
            user: `${baseUser}.${ref}`,
            ssl: undefined,
            label: `Local Supavisor with Tenant (${h}:${p} as ${baseUser}.${ref})`
          });

          // Try without suffix
          candidates.push({
            host: h,
            port: p,
            user: baseUser,
            ssl: undefined,
            label: `Local Standard No-Suffix (${h}:${p} as ${baseUser})`
          });
        }
      }
    }
  }

  let lastError: any = null;
  const passwordsToTry = Array.from(candidatePasswords);

  for (const cand of candidates) {
    for (const pw of passwordsToTry) {
      console.log(`[DB_DEBUG] Trying: ${cand.label} (${cand.host}:${cand.port} as ${cand.user})...`);
      const client = new pg.Client({
        host: cand.host,
        port: parseInt(cand.port, 10) || 5432,
        user: cand.user,
        password: pw,
        database: config.database,
        ssl: cand.ssl,
        connectionTimeoutMillis: 1500
      });

      try {
        await client.connect();
        console.log(`[DB_DEBUG] Successful connection via: ${cand.label}`);
        return client;
      } catch (err: any) {
        console.log(`[DB_DEBUG] Candidate failed: ${cand.label}. Error: ${err.message}`);
        lastError = err;
        try {
          await client.end();
        } catch {}
      }
    }
  }

  console.error("[DB_DEBUG] All connection attempts failed.");
  throw lastError || new Error("Failed to connect to database");
}

export const getActiveSessionsUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const client = await getDbClient();
    try {
      const query = `
        SELECT id, created_at, updated_at, ip, user_agent
        FROM auth.sessions
        WHERE user_id = $1
        ORDER BY updated_at DESC
      `;
      const { rows } = await client.query(query, [userId]);
      return { sessions: rows };
    } catch (err: any) {
      throw new Error(err.message || "Failed to query active sessions");
    } finally {
      await client.end();
    }
  });

export const terminateSessionUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const sessionId = data.sessionId;
    if (!sessionId) throw new Error("Session ID required");

    const client = await getDbClient();
    try {
      const query = `
        DELETE FROM auth.sessions
        WHERE id = $1 AND user_id = $2
      `;
      const { rowCount } = await client.query(query, [sessionId, userId]);
      return { ok: true, terminatedCount: rowCount };
    } catch (err: any) {
      throw new Error(err.message || "Failed to terminate session");
    } finally {
      await client.end();
    }
  });

export const getPushNotificationTargetCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data: roleRows, error: rolesErr } = await context.supabase
        .from("user_roles").select("role").eq("user_id", context.userId);
      if (rolesErr) throw new Error(rolesErr.message);
      const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
      if (!isAdmin) throw new Error("Admins only");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Fetch all admin/super-admin IDs from user_roles
      const { data: adminRoleRows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);
      const adminIds = (adminRoleRows ?? []).map((r: any) => r.user_id);

      // Query push_tokens count where user_id is not in adminIds
      let query = supabaseAdmin
        .from("push_tokens")
        .select("id", { count: "exact", head: true });

      if (adminIds.length > 0) {
        query = query.not("user_id", "in", `(${adminIds.join(",")})`);
      }

      const { count, error } = await query;
      if (error) throw new Error(error.message);

      return { count: count ?? 0 };
    } catch (e: any) {
      console.error("[getPushNotificationTargetCount Error]:", e);
      return { count: 0, error: e.message };
    }
  });

export const sendCustomPushNotificationAllUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { title: string; message: string }) => {
    if (!d.title?.trim()) throw new Error("Title is required");
    if (!d.message?.trim()) throw new Error("Message is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    try {
      const { data: roleRows, error: rolesErr } = await context.supabase
        .from("user_roles").select("role").eq("user_id", context.userId);
      if (rolesErr) throw new Error(rolesErr.message);
      const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
      if (!isAdmin) throw new Error("Admins only");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Fetch all admin/super-admin IDs from user_roles
      const { data: adminRoleRows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);
      const adminIds = (adminRoleRows ?? []).map((r: any) => r.user_id);

      // Query push_tokens where user_id is not in adminIds
      let query = supabaseAdmin
        .from("push_tokens")
        .select("token");

      if (adminIds.length > 0) {
        query = query.not("user_id", "in", `(${adminIds.join(",")})`);
      }

      const { data: tokenRows, error: tokenError } = await query;
      if (tokenError) throw new Error(tokenError.message);

      const tokens = (tokenRows ?? []).map((t: any) => t.token);

      if (tokens.length > 0) {
        const { sendPushNotification } = await import("@/lib/fcm.server");
        await sendPushNotification(tokens, data.title, data.message, {
          type: "custom_announcement",
        });
      }

      return { success: true, sentCount: tokens.length };
    } catch (e: any) {
      console.error("[sendCustomPushNotificationAllUsers Error]:", e);
      return { success: false, error: e.message };
    }
  });



