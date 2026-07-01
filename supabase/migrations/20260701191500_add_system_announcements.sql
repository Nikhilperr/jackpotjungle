-- Create system_announcements table
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL CHECK (channel_type IN ('rules', 'updates')),
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT,
  image_url TEXT,
  audio_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

-- Select policy: all authenticated users can read
DROP POLICY IF EXISTS "authenticated_select_announcements" ON public.system_announcements;
CREATE POLICY "authenticated_select_announcements" 
ON public.system_announcements FOR SELECT TO authenticated USING (true);

-- Insert/Update/Delete policy: only admins/super_admins
DROP POLICY IF EXISTS "admin_manage_announcements" ON public.system_announcements;
CREATE POLICY "admin_manage_announcements" 
ON public.system_announcements FOR ALL TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_announcements TO authenticated;
GRANT ALL ON public.system_announcements TO service_role;

-- Try adding to Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'system_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_announcements;
  END IF;
END $$;

ALTER TABLE public.system_announcements REPLICA IDENTITY FULL;
