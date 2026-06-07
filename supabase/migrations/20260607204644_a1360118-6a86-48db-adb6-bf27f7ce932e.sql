
CREATE TABLE public.spam_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  spammed_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, spammed_user_id)
);

GRANT SELECT, INSERT, DELETE ON public.spam_list TO authenticated;
GRANT ALL ON public.spam_list TO service_role;

ALTER TABLE public.spam_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own spam entries"
  ON public.spam_list FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- The spammed user can see that they have been spammed (so client can render offline)
CREATE POLICY "Spammed user can see entries about themselves"
  ON public.spam_list FOR SELECT
  USING (auth.uid() = spammed_user_id);

CREATE INDEX spam_list_user_idx ON public.spam_list(user_id);
CREATE INDEX spam_list_spammed_idx ON public.spam_list(spammed_user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.spam_list;
