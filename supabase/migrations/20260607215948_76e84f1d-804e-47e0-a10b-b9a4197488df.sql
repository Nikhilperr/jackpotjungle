
CREATE TYPE public.call_type AS ENUM ('voice', 'video');
CREATE TYPE public.call_status AS ENUM ('ringing', 'active', 'ended', 'missed', 'declined', 'canceled');

CREATE TABLE public.calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_type public.call_type NOT NULL DEFAULT 'voice',
  status public.call_status NOT NULL DEFAULT 'ringing',
  -- context: which conversation (friend or page) this call belongs to (for history bubble)
  context TEXT NOT NULL DEFAULT 'friend', -- 'friend' | 'page'
  page_conversation_id UUID REFERENCES public.page_conversations(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX calls_caller_idx ON public.calls(caller_id, created_at DESC);
CREATE INDEX calls_callee_idx ON public.calls(callee_id, created_at DESC);
CREATE INDEX calls_page_conv_idx ON public.calls(page_conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their calls"
  ON public.calls FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "Caller can create call"
  ON public.calls FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Participants can update call"
  ON public.calls FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id)
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE OR REPLACE FUNCTION public.touch_calls_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER calls_updated_at BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.touch_calls_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER TABLE public.calls REPLICA IDENTITY FULL;
