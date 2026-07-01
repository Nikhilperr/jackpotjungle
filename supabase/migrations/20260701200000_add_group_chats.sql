-- 1. Create groups table
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Create group_members table
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- 3. Add group_id to messages and make receiver_id nullable
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE;
ALTER TABLE public.messages ALTER COLUMN receiver_id DROP NOT NULL;

-- 4. Enable Row Level Security (RLS) and grant permissions
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;

-- 5. Create SECURITY DEFINER functions to bypass RLS recursion
CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID, uid UUID)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = gid AND user_id = uid
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_group_admin(gid UUID, uid UUID)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = gid AND user_id = uid AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

-- 6. Add RLS Policies for groups and group_members
DROP POLICY IF EXISTS "view_groups" ON public.groups;
CREATE POLICY "view_groups" ON public.groups FOR SELECT TO authenticated
  USING (
    created_by = auth.uid() OR
    public.is_group_member(id, auth.uid())
  );

DROP POLICY IF EXISTS "create_groups" ON public.groups;
CREATE POLICY "create_groups" ON public.groups FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "update_groups" ON public.groups;
CREATE POLICY "update_groups" ON public.groups FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by OR
    public.is_group_admin(id, auth.uid())
  );

DROP POLICY IF EXISTS "view_group_members" ON public.group_members;
CREATE POLICY "view_group_members" ON public.group_members FOR SELECT TO authenticated
  USING (
    public.is_group_member(group_id, auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_id AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_group_members" ON public.group_members;
CREATE POLICY "insert_group_members" ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    public.is_group_admin(group_id, auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_id AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_group_members" ON public.group_members;
CREATE POLICY "update_group_members" ON public.group_members FOR UPDATE TO authenticated
  USING (
    public.is_group_admin(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "delete_group_members" ON public.group_members;
CREATE POLICY "delete_group_members" ON public.group_members FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    public.is_group_admin(group_id, auth.uid())
  );

-- 7. Update public.messages RLS Policies to support groups
DROP POLICY IF EXISTS "view own messages" ON public.messages;
CREATE POLICY "view own messages" ON public.messages FOR SELECT TO authenticated
  USING (
    auth.uid() = sender_id OR 
    auth.uid() = receiver_id OR
    (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
  );

DROP POLICY IF EXISTS "send messages" ON public.messages;
CREATE POLICY "send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id 
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_blocked = true)
    AND (
      group_id IS NULL OR public.is_group_member(group_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "mark seen as receiver" ON public.messages;
CREATE POLICY "mark seen as receiver" ON public.messages FOR UPDATE TO authenticated
  USING (
    auth.uid() = receiver_id OR
    (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
  )
  WITH CHECK (
    auth.uid() = receiver_id OR
    (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
  );

-- 7. Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;

ALTER TABLE public.groups REPLICA IDENTITY FULL;
ALTER TABLE public.group_members REPLICA IDENTITY FULL;

-- 8. Add foreign key relationships to public.profiles for PostgREST joins
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS fk_messages_sender_profile;
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_sender_profile FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS fk_group_members_user_profile;
ALTER TABLE public.group_members ADD CONSTRAINT fk_group_members_user_profile FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS fk_groups_creator_profile;
ALTER TABLE public.groups ADD CONSTRAINT fk_groups_creator_profile FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
