-- Alter wallet_transactions to support external reference IDs
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;

-- Create subaccounts mapping
CREATE TABLE IF NOT EXISTS public.user_subaccounts (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  sub_account_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create deposit addresses cache
CREATE TABLE IF NOT EXISTS public.user_deposit_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  coin TEXT NOT NULL,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  tag TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, coin, network)
);

-- Enable RLS
ALTER TABLE public.user_subaccounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_deposit_addresses ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
DROP POLICY IF EXISTS "user reads own subaccount" ON public.user_subaccounts;
CREATE POLICY "user reads own subaccount" ON public.user_subaccounts FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user reads own deposit addresses" ON public.user_deposit_addresses;
CREATE POLICY "user reads own deposit addresses" ON public.user_deposit_addresses FOR SELECT USING (auth.uid() = user_id);

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_subaccounts TO authenticated;
GRANT ALL ON public.user_subaccounts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_deposit_addresses TO authenticated;
GRANT ALL ON public.user_deposit_addresses TO service_role;
