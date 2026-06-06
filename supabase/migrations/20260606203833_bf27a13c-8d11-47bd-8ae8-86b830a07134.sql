-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. Policies
DROP POLICY IF EXISTS "view own roles" ON public.user_roles;
CREATE POLICY "view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "super admin manages roles" ON public.user_roles;
CREATE POLICY "super admin manages roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 5. Update handle_new_user to also assign 'user' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '_' || substr(NEW.id::text, 1, 4);
  END IF;
  INSERT INTO public.profiles (id, username, email, friend_code, referral_code)
  VALUES (NEW.id, uname, NEW.email, public.gen_code('JJM'), public.gen_code('JJREF'));

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- 6. Backfill existing users as 'user' and promote first account to super_admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'user'::public.app_role FROM public.profiles
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('75e74ad5-89d7-43cc-8e25-c874858232a8', 'super_admin')
ON CONFLICT DO NOTHING;
