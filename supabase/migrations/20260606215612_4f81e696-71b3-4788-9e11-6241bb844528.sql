
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.page_messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.page_messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.page_messages ADD COLUMN IF NOT EXISTS audio_url TEXT;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notif_enabled BOOLEAN NOT NULL DEFAULT true;
