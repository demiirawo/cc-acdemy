
CREATE POLICY "Public can update answers for in-progress attempt"
ON public.recruitment_answers
FOR UPDATE
TO anon, authenticated
USING (public.is_recruitment_attempt_in_progress(attempt_id))
WITH CHECK (public.is_recruitment_attempt_in_progress(attempt_id));
