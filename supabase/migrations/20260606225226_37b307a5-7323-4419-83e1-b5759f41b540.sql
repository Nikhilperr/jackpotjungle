
-- Allow admins to delete (unsend) any page message
CREATE POLICY "admins unsend page msgs" ON public.page_messages
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Block users from sending if profile.is_blocked is true
DROP POLICY IF EXISTS "user sends to page" ON public.page_messages;
CREATE POLICY "user sends to page" ON public.page_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND from_page = false
    AND EXISTS (SELECT 1 FROM public.page_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_blocked = true)
  );
