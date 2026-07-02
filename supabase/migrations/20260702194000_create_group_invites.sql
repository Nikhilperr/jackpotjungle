-- Create public.group_invites table for secure invite links

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

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_invites;
ALTER TABLE public.group_invites REPLICA IDENTITY FULL;
