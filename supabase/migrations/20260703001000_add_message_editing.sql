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
