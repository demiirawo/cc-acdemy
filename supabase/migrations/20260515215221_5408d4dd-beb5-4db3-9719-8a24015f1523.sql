CREATE OR REPLACE FUNCTION public.is_recruitment_test_live(_test_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recruitment_tests
    WHERE id = _test_id AND status = 'live'
  );
$$;

DROP POLICY IF EXISTS "Public can create attempt for live test" ON public.recruitment_attempts;
CREATE POLICY "Public can create attempt for live test"
ON public.recruitment_attempts
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_recruitment_test_live(test_id));

DROP POLICY IF EXISTS "Public can insert answers" ON public.recruitment_answers;
CREATE POLICY "Public can insert answers"
ON public.recruitment_answers
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.recruitment_attempts a
    WHERE a.id = attempt_id AND a.status = 'in_progress'
  )
);

DROP POLICY IF EXISTS "Public can insert events" ON public.recruitment_events;
CREATE POLICY "Public can insert events"
ON public.recruitment_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.recruitment_attempts a
    WHERE a.id = attempt_id AND a.status = 'in_progress'
  )
);