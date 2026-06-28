-- Drop policy if it exists to prevent conflict
DROP POLICY IF EXISTS "users insert own profile" ON public.profiles;

-- Create policy to allow authenticated users to insert their own profile
CREATE POLICY "users insert own profile" ON public.profiles 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = id);
