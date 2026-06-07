REVOKE UPDATE ON public.messages FROM authenticated;
GRANT UPDATE (seen, delivered) ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

REVOKE UPDATE ON public.page_messages FROM authenticated;
GRANT UPDATE (seen) ON public.page_messages TO authenticated;
GRANT ALL ON public.page_messages TO service_role;