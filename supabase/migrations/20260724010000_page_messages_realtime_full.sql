-- Ensure page inbox realtime delivers INSERT/UPDATE/DELETE reliably
-- (filtered DELETE/UPDATE need REPLICA IDENTITY FULL).

ALTER TABLE public.page_messages REPLICA IDENTITY FULL;
ALTER TABLE public.page_conversations REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.page_messages';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.page_conversations';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;
