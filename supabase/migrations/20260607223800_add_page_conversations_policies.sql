-- Drop policies if they exist
DROP POLICY IF EXISTS "users insert own page conversation" ON public.page_conversations;
DROP POLICY IF EXISTS "users update own page conversation" ON public.page_conversations;

-- Allow authenticated users to create their own page conversation row
CREATE POLICY "users insert own page conversation" ON public.page_conversations 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users and admins to update page conversation rows
CREATE POLICY "users update own page conversation" ON public.page_conversations 
  FOR UPDATE 
  TO authenticated 
  USING (
    auth.uid() = user_id 
    OR public.has_role(auth.uid(),'admin'::app_role) 
    OR public.has_role(auth.uid(),'super_admin'::app_role)
  );
