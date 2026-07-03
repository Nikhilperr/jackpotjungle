-- Add user management fields to profiles table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS cover_photo TEXT,
  ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark',
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
