
CREATE OR REPLACE FUNCTION public.gen_code(prefix TEXT) RETURNS TEXT
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c TEXT;
BEGIN
  c := prefix || '-' || lpad((floor(random()*900000)+100000)::int::text, 6, '0');
  RETURN c;
END $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_friend_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_code(TEXT) FROM PUBLIC, anon, authenticated;
