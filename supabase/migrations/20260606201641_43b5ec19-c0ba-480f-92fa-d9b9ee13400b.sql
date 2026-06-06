
-- 1. Hide profiles.email from authenticated users (column-level revoke). Service role keeps full access.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, username, avatar_url, friend_code, online, last_seen, referral_code, created_at)
  ON public.profiles TO authenticated;
GRANT UPDATE, INSERT, DELETE ON public.profiles TO authenticated;

-- 2. friend_requests: prevent sender_id/receiver_id tampering on UPDATE
CREATE OR REPLACE FUNCTION public.friend_requests_lock_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id <> OLD.sender_id OR NEW.receiver_id <> OLD.receiver_id THEN
    RAISE EXCEPTION 'sender_id and receiver_id are immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS friend_requests_lock_identity ON public.friend_requests;
CREATE TRIGGER friend_requests_lock_identity
  BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.friend_requests_lock_identity();

-- 3. friendships: block direct INSERTs from clients. The accept_friend_request
-- trigger is SECURITY DEFINER and continues to insert on accepted requests.
DROP POLICY IF EXISTS "insert friendships involving self" ON public.friendships;
