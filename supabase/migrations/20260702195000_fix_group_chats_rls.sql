-- Fix and strengthen RLS policies for groups, group_members, and messages to support app-level admins/super_admins

-- groups Select
DROP POLICY IF EXISTS "view_groups" ON public.groups;
CREATE POLICY "view_groups" ON public.groups FOR SELECT TO authenticated
  USING (
    created_by = auth.uid() OR
    public.is_group_member(id, auth.uid()) OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin')
  );

-- groups Update
DROP POLICY IF EXISTS "update_groups" ON public.groups;
CREATE POLICY "update_groups" ON public.groups FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by OR
    public.is_group_admin(id, auth.uid()) OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin')
  );

-- group_members Select
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

-- group_members Insert
DROP POLICY IF EXISTS "insert_group_members" ON public.group_members;
CREATE POLICY "insert_group_members" ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    public.is_group_admin(group_id, auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_id AND created_by = auth.uid()
    ) OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin')
  );

-- group_members Update
DROP POLICY IF EXISTS "update_group_members" ON public.group_members;
CREATE POLICY "update_group_members" ON public.group_members FOR UPDATE TO authenticated
  USING (
    public.is_group_admin(group_id, auth.uid()) OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin')
  );

-- group_members Delete
DROP POLICY IF EXISTS "delete_group_members" ON public.group_members;
CREATE POLICY "delete_group_members" ON public.group_members FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    public.is_group_admin(group_id, auth.uid()) OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin')
  );

-- messages Select
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

-- messages Insert
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
