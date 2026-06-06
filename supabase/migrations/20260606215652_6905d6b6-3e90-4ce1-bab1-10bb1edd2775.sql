
-- Anyone signed in can read media (URLs are signed and only sent in chats they participate in)
CREATE POLICY "auth read media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('avatars','chat-images','chat-audio'));

-- Users can upload/update/delete only within their own user-id folder
CREATE POLICY "user upload media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('avatars','chat-images','chat-audio') AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user update media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('avatars','chat-images','chat-audio') AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user delete media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('avatars','chat-images','chat-audio') AND auth.uid()::text = (storage.foldername(name))[1]);
