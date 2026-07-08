-- ============ SYSTEM SETTINGS ============
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage system_settings" ON public.system_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "authenticated read system_settings" ON public.system_settings FOR SELECT TO authenticated
  USING (true);

-- Seed re-engagement campaign config
INSERT INTO public.system_settings (key, value)
VALUES (
  'reengagement_campaign',
  '{"enabled": true, "inactivity_days": 3, "message_template": "🎰 Hi {PlayerName}!\n\n👋 It''s been a little while since we last saw you.\n\n🎁 We''ve missed you!\n\nCome back and check out today''s promotions and exciting games.\n\nGood luck,\n\n✨ Jackpot Jungle Team"}'
)
ON CONFLICT (key) DO NOTHING;
