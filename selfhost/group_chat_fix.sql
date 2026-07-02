-- Group Chat Production Fixes Migration
-- Contains all RLS policies, table creation for group invites, and storage objects policy fixes.

-- 1. Create public.system_announcements table
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

-- 2. Create public.group_invites table for secure invite links
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

-- 3. Fix and strengthen RLS policies for groups, group_members, and messages to support app-level admins/super_admins
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

-- 4. Update storage buckets to be public for CDN/public access compatibility
UPDATE storage.buckets SET public = true WHERE id IN ('avatars', 'chat-images', 'chat-audio');

-- SELECT policy: Allow all authenticated users to read avatars, chat images, and chat audio
DROP POLICY IF EXISTS "auth read media" ON storage.objects;
CREATE POLICY "auth read media" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
);

-- INSERT policy: Allow users to upload to their own user directory, or group admins to group directory
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

-- UPDATE policy: Allow users to update their own files, or group admins to update group files
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

-- DELETE policy: Allow users to delete their own files, or group admins to delete group files
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
  )
);
