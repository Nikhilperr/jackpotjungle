-- Create public.vip_player_rewards table
CREATE TABLE IF NOT EXISTS public.vip_player_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.vip_reward_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username VARCHAR NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  vip_status VARCHAR NOT NULL,
  deposit_score NUMERIC NOT NULL,
  holding_score NUMERIC NOT NULL,
  referral_score NUMERIC NOT NULL,
  loyalty_score NUMERIC NOT NULL,
  base_score NUMERIC NOT NULL,
  multiplier NUMERIC NOT NULL,
  final_score NUMERIC NOT NULL,
  reward_amount NUMERIC NOT NULL,
  distribution_date TIMESTAMPTZ NOT NULL,
  approval_status VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on vip_player_rewards
ALTER TABLE public.vip_player_rewards ENABLE ROW LEVEL SECURITY;

-- Policies for vip_player_rewards
DROP POLICY IF EXISTS "user_view_own_vip_player_rewards" ON public.vip_player_rewards;
CREATE POLICY "user_view_own_vip_player_rewards" ON public.vip_player_rewards
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Create public.vip_audit_logs table
CREATE TABLE IF NOT EXISTS public.vip_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  username VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  ip_address VARCHAR,
  device_info VARCHAR
);

-- Enable RLS on vip_audit_logs
ALTER TABLE public.vip_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for vip_audit_logs: only admins/super admins can select
DROP POLICY IF EXISTS "admins_view_all_vip_audit_logs" ON public.vip_audit_logs;
CREATE POLICY "admins_view_all_vip_audit_logs" ON public.vip_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Grant permissions
GRANT SELECT ON public.vip_player_rewards TO authenticated;
GRANT ALL ON public.vip_player_rewards TO service_role;

GRANT SELECT ON public.vip_audit_logs TO authenticated;
GRANT ALL ON public.vip_audit_logs TO service_role;

-- Add tables to realtime publication if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'vip_player_rewards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_player_rewards;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'vip_audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_audit_logs;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
