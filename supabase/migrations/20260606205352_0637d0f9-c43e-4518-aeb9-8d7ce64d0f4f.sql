-- Page conversation: one per user, all admins share inbox
CREATE TABLE public.page_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.page_conversations TO authenticated;
GRANT ALL ON public.page_conversations TO service_role;
ALTER TABLE public.page_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or admin" ON public.page_conversations
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
  );

CREATE TABLE public.page_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.page_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  from_page boolean NOT NULL DEFAULT false,
  content text NOT NULL,
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.page_messages TO authenticated;
GRANT ALL ON public.page_messages TO service_role;
ALTER TABLE public.page_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view page msgs" ON public.page_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.page_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
  );

CREATE POLICY "user sends to page" ON public.page_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND from_page = false
    AND EXISTS (SELECT 1 FROM public.page_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );

CREATE POLICY "admin replies as page" ON public.page_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND from_page = true
    AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role))
  );

CREATE POLICY "mark seen page" ON public.page_messages
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.page_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
  ) WITH CHECK (true);

-- Bump conversation timestamp on new message
CREATE OR REPLACE FUNCTION public.bump_page_conv()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.page_conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bump_page_conv AFTER INSERT ON public.page_messages
FOR EACH ROW EXECUTE FUNCTION public.bump_page_conv();

-- Auto-create page conversation for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '_' || substr(NEW.id::text,1,4);
  END IF;
  INSERT INTO public.profiles (id, username, email, friend_code, referral_code)
  VALUES (NEW.id, uname, NEW.email, public.gen_code('JJM'), public.gen_code('JJREF'));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.page_conversations (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- Backfill page conversations for existing users
INSERT INTO public.page_conversations (user_id)
SELECT id FROM public.profiles ON CONFLICT DO NOTHING;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.page_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.page_conversations;