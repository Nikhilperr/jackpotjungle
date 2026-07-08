-- Create scheduled_reports table for automated reports scheduling
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL, -- 'revenue' | 'deposit' | 'withdrawal' | 'support' | 'broadcast' | 'promotion' | 'user_growth' | 'vip' | 'general'
  frequency TEXT NOT NULL, -- 'daily' | 'weekly' | 'monthly' | 'friday_evening'
  time_of_day TEXT DEFAULT '09:00', -- HH:MM format
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  delivery_email TEXT, -- optional email address for delivery
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

-- Allow admins and super_admins to perform all actions
DROP POLICY IF EXISTS "admins manage scheduled_reports" ON public.scheduled_reports;
CREATE POLICY "admins manage scheduled_reports" ON public.scheduled_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_reports TO authenticated;
GRANT ALL ON public.scheduled_reports TO service_role;

-- Enable realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'scheduled_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_reports;
  END IF;
END $$;

ALTER TABLE public.scheduled_reports REPLICA IDENTITY FULL;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
