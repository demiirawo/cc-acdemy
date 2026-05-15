GRANT SELECT ON public.recruitment_tests TO anon, authenticated;
GRANT SELECT ON public.recruitment_questions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recruitment_attempts TO anon, authenticated;
GRANT INSERT ON public.recruitment_answers TO anon, authenticated;
GRANT INSERT ON public.recruitment_events TO anon, authenticated;
GRANT INSERT ON public.recruitment_snapshots TO anon, authenticated;