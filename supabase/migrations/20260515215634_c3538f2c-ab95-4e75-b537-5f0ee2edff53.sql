GRANT SELECT, INSERT, UPDATE ON public.recruitment_attempts TO anon, authenticated;
GRANT SELECT ON public.recruitment_tests TO anon, authenticated;
GRANT SELECT ON public.recruitment_questions TO anon, authenticated;
GRANT INSERT ON public.recruitment_answers TO anon, authenticated;
GRANT INSERT ON public.recruitment_events TO anon, authenticated;
GRANT INSERT ON public.recruitment_snapshots TO anon, authenticated;

DROP POLICY IF EXISTS "Public can create attempt for live test" ON public.recruitment_attempts;
CREATE POLICY "Public can create attempt for live test"
ON public.recruitment_attempts
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_recruitment_test_live(test_id));