CREATE OR REPLACE FUNCTION public.is_recruitment_attempt_in_progress(_attempt_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recruitment_attempts
    WHERE id = _attempt_id
      AND status = 'in_progress'
  );
$$;

DROP POLICY IF EXISTS "Public can insert answers" ON public.recruitment_answers;
CREATE POLICY "Public can insert answers"
ON public.recruitment_answers
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_recruitment_attempt_in_progress(attempt_id));

DROP POLICY IF EXISTS "Public can insert events" ON public.recruitment_events;
CREATE POLICY "Public can insert events"
ON public.recruitment_events
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_recruitment_attempt_in_progress(attempt_id));

DROP POLICY IF EXISTS "Public can insert snapshots" ON public.recruitment_snapshots;
CREATE POLICY "Public can insert snapshots"
ON public.recruitment_snapshots
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_recruitment_attempt_in_progress(attempt_id));