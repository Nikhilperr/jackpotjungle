-- Ensure storage buckets exist and are public for CDN/public access compatibility
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, ARRAY['image/*']),
  ('chat-images', 'chat-images', true, 10485760, ARRAY['image/*']),
  ('chat-audio', 'chat-audio', true, 10485760, ARRAY['audio/*'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- 1. SELECT policy: Allow all authenticated users to read avatars, chat images, and chat audio
DROP POLICY IF EXISTS "auth read media" ON storage.objects;
CREATE POLICY "auth read media" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
);

-- 2. INSERT policy: Allow users to upload to their own user directory, or group admins to group directory
DROP POLICY IF EXISTS "user upload media" ON storage.objects;
CREATE POLICY "user upload media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    )
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- 3. UPDATE policy: Allow users to update their own files, or group admins to update group files
DROP POLICY IF EXISTS "user update media" ON storage.objects;
CREATE POLICY "user update media" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    )
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- 4. DELETE policy: Allow users to delete their own files, or group admins to delete group files
DROP POLICY IF EXISTS "user delete media" ON storage.objects;
CREATE POLICY "user delete media" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars','chat-images','chat-audio'])
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    )
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  )
);
