-- ============================================================================
-- VPS CATCH-UP MIGRATION
-- Run on your self-hosted VPS Postgres AFTER all other migrations and AFTER
-- the supabase-auth + supabase-storage containers are up (so auth.users and
-- storage.buckets exist).
--
-- Fixes the 3 pieces missing from the per-feature migrations that break
-- messaging on a fresh install:
--   1. Storage buckets (avatars, chat-images, chat-audio) + policies
--   2. Auth trigger on auth.users -> handle_new_user()  (creates profile row;
--      without it RLS blocks every message insert)
--   3. Realtime publication + REPLICA IDENTITY FULL for live chat/calls
--
-- Run with:  psql "$DATABASE_URL" -f vps_catchup.sql
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. STORAGE BUCKETS -----------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars',     'avatars',     false),
  ('chat-images', 'chat-images', false),
  ('chat-audio',  'chat-audio',  false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth read media"   ON storage.objects;
DROP POLICY IF EXISTS "user upload media" ON storage.objects;
DROP POLICY IF EXISTS "user update media" ON storage.objects;
DROP POLICY IF EXISTS "user delete media" ON storage.objects;

CREATE POLICY "auth read media" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

CREATE POLICY "user upload media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "user update media" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "user delete media" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 2. AUTH TRIGGER --------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. REALTIME ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END$$;

ALTER TABLE public.messages        REPLICA IDENTITY FULL;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;
ALTER TABLE public.calls           REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages','page_messages','page_conversations',
    'friend_requests','friendships','calls','spam_list'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END$$;
