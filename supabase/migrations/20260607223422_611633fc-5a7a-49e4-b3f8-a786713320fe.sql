
-- Allow page broadcast calls (callee_id null until an admin claims)
ALTER TABLE public.calls ALTER COLUMN callee_id DROP NOT NULL;

-- Replace policies to allow admins to see/claim unassigned page broadcast calls
DROP POLICY IF EXISTS "Participants can view their calls" ON public.calls;
DROP POLICY IF EXISTS "Participants can update call" ON public.calls;

CREATE POLICY "View calls (participant or admin broadcast)"
ON public.calls FOR SELECT
USING (
  auth.uid() = caller_id
  OR auth.uid() = callee_id
  OR (
    context = 'page_broadcast'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  )
);

CREATE POLICY "Update calls (participant or admin claim)"
ON public.calls FOR UPDATE
USING (
  auth.uid() = caller_id
  OR auth.uid() = callee_id
  OR (
    context = 'page_broadcast'
    AND callee_id IS NULL
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  )
)
WITH CHECK (
  auth.uid() = caller_id
  OR auth.uid() = callee_id
  OR (
    context = 'page_broadcast'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  )
);
