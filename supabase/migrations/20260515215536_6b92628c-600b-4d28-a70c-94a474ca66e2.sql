DROP POLICY IF EXISTS "Public can create attempt for live test" ON public.recruitment_attempts;
CREATE POLICY "Public can create attempt for live test"
ON public.recruitment_attempts
FOR INSERT
TO anon, authenticated
WITH CHECK (true);