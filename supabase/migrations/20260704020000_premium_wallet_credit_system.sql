-- Alter profiles to add wallet columns for Premium Wallet Credit System
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credit_balance NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_deposits NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_released NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_used NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_last_updated TIMESTAMPTZ DEFAULT now();

-- Create wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_name TEXT,
  action TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  avail_before NUMERIC NOT NULL,
  avail_after NUMERIC NOT NULL,
  credit_before NUMERIC NOT NULL,
  credit_after NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT
);

-- Enable RLS on wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "user reads own wallet transactions" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "admin writes wallet transactions" ON public.wallet_transactions;
CREATE POLICY "admin writes wallet transactions" ON public.wallet_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Create user_notifications table
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  seen BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on user_notifications
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own notifications" ON public.user_notifications;
CREATE POLICY "user reads own notifications" ON public.user_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin writes notifications" ON public.user_notifications;
CREATE POLICY "admin writes notifications" ON public.user_notifications
  FOR ALL TO service_role;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

-- Enable realtime for new tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'wallet_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END $$;

ALTER TABLE public.wallet_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
