-- Create vip_reward_settings table
CREATE TABLE IF NOT EXISTS public.vip_reward_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CONSTRAINT one_row CHECK (id = TRUE),
  reward_pool_percentage NUMERIC NOT NULL DEFAULT 5.0 CHECK (reward_pool_percentage >= 0 AND reward_pool_percentage <= 100),
  deposit_weight NUMERIC NOT NULL DEFAULT 35.0 CHECK (deposit_weight >= 0),
  holding_weight NUMERIC NOT NULL DEFAULT 30.0 CHECK (holding_weight >= 0),
  referral_weight NUMERIC NOT NULL DEFAULT 15.0 CHECK (referral_weight >= 0),
  loyalty_weight NUMERIC NOT NULL DEFAULT 20.0 CHECK (loyalty_weight >= 0),
  reward_cap_percentage NUMERIC NOT NULL DEFAULT 10.0 CHECK (reward_cap_percentage >= 0 AND reward_cap_percentage <= 100),
  min_monthly_deposit NUMERIC NOT NULL DEFAULT 100.0 CHECK (min_monthly_deposit >= 0),
  min_holding_requirement NUMERIC NOT NULL DEFAULT 50.0 CHECK (min_holding_requirement >= 0),
  distribution_date INTEGER NOT NULL DEFAULT 1 CHECK (distribution_date >= 1 AND distribution_date <= 28),
  vip_multipliers JSONB NOT NULL DEFAULT '{"bronze": 1.00, "silver": 1.05, "gold": 1.10, "platinum": 1.20, "diamond": 1.30, "black_diamond": 1.50}',
  referral_qualification_rules JSONB NOT NULL DEFAULT '{"min_referred_deposit": 50.0, "requires_verification": false}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT weights_sum_100 CHECK (deposit_weight + holding_weight + referral_weight + loyalty_weight = 100)
);

-- Enable RLS
ALTER TABLE public.vip_reward_settings ENABLE ROW LEVEL SECURITY;

-- Create super_admin policy
DROP POLICY IF EXISTS "super_admins_all_vip_settings" ON public.vip_reward_settings;
CREATE POLICY "super_admins_all_vip_settings" ON public.vip_reward_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Seed default configuration
INSERT INTO public.vip_reward_settings (
  id, reward_pool_percentage, deposit_weight, holding_weight, referral_weight, loyalty_weight,
  reward_cap_percentage, min_monthly_deposit, min_holding_requirement, distribution_date,
  vip_multipliers, referral_qualification_rules
) VALUES (
  TRUE, 5.0, 35.0, 30.0, 15.0, 20.0, 10.0, 100.0, 50.0, 1,
  '{"bronze": 1.00, "silver": 1.05, "gold": 1.10, "platinum": 1.20, "diamond": 1.30, "black_diamond": 1.50}',
  '{"min_referred_deposit": 50.0, "requires_verification": false}'
)
ON CONFLICT (id) DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_reward_settings TO authenticated;
GRANT ALL ON public.vip_reward_settings TO service_role;

-- Add table to publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'vip_reward_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_reward_settings;
  END IF;
END $$;

-- Reload schema
NOTIFY pgrst, 'reload schema';
