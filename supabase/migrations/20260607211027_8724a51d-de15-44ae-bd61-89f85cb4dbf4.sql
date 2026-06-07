ALTER TABLE public.page_conversations
  ADD COLUMN IF NOT EXISTS is_spam boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS page_conversations_is_spam_idx
  ON public.page_conversations (is_spam);

-- Allow admins to toggle is_spam. Existing SELECT policy already lets admins see all rows.
DROP POLICY IF EXISTS "Admins can update page conversations" ON public.page_conversations;
CREATE POLICY "Admins can update page conversations"
  ON public.page_conversations
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));