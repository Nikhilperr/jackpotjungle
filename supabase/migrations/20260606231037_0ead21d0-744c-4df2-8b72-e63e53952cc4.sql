
-- 1. Profiles: restrict UPDATE to safe columns only (no email/is_blocked/referred_by/id changes)
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, avatar_url, online, last_seen, notif_enabled) ON public.profiles TO authenticated;

-- 2. messages INSERT: block blocked users
DROP POLICY IF EXISTS "send messages" ON public.messages;
CREATE POLICY "send messages" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_blocked = true)
);

-- 3. page_messages "mark seen page": tighten WITH CHECK to mirror USING
DROP POLICY IF EXISTS "mark seen page" ON public.page_messages;
CREATE POLICY "mark seen page" ON public.page_messages
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.page_conversations c WHERE c.id = page_messages.conversation_id AND c.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.page_conversations c WHERE c.id = page_messages.conversation_id AND c.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- 4. Storage: restrict chat media reads to owner (first folder segment = uid) or admins
DROP POLICY IF EXISTS "auth read media" ON storage.objects;
CREATE POLICY "auth read media" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars'::text, 'chat-images'::text, 'chat-audio'::text])
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- 5. Revoke EXECUTE on internal/admin SECURITY DEFINER functions from public roles
REVOKE EXECUTE ON FUNCTION public.accept_friend_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.friend_requests_lock_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_page_conv() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_code(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_credits(uuid, numeric, text, text) FROM PUBLIC, anon;
-- adjust_credits remains callable by authenticated (admins enforced inside); other admin-only access via service_role
