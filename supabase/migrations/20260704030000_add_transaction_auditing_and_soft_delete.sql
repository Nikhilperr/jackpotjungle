-- Alter wallet_transactions to support auditing and soft-deletion
ALTER TABLE public.wallet_transactions 
  ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
