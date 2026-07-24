-- Messenger-style context for push suppression:
-- skip FCM only when the recipient is in the foreground AND viewing that conversation.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_conversation_key text,
  ADD COLUMN IF NOT EXISTS app_in_foreground boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active_conversation_at timestamptz;

COMMENT ON COLUMN public.profiles.active_conversation_key IS
  'Client-reported conversation currently open (dm uuid, group-{id}, page:{id}).';
COMMENT ON COLUMN public.profiles.app_in_foreground IS
  'True while the app/webview is visible; false when backgrounded.';
COMMENT ON COLUMN public.profiles.active_conversation_at IS
  'Last time active conversation / foreground context was updated.';
