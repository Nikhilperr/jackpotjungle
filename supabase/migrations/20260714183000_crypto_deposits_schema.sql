-- Create crypto_deposits table to track cryptocurrency transactions
CREATE TABLE IF NOT EXISTS public.crypto_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  coin TEXT NOT NULL,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  amount NUMERIC(20, 8) NOT NULL,
  usd_value NUMERIC(12, 2) NOT NULL,
  txid TEXT NOT NULL UNIQUE,
  binance_ref TEXT,
  confirmations INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  wallet_credited BOOLEAN DEFAULT FALSE,
  deposit_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.crypto_deposits ENABLE ROW LEVEL SECURITY;

-- Add RLS Policy for user visibility
DROP POLICY IF EXISTS "user reads own deposits" ON public.crypto_deposits;
CREATE POLICY "user reads own deposits" ON public.crypto_deposits FOR SELECT USING (auth.uid() = user_id);

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crypto_deposits TO authenticated;
GRANT ALL ON public.crypto_deposits TO service_role;
