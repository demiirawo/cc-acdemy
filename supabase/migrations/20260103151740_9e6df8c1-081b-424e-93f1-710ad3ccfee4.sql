-- Add a policy to allow public (unauthenticated) users to view approved holidays
-- This ensures the public schedule page can show holidays without login

CREATE POLICY "Public can view approved holidays" 
ON public.staff_holidays 
FOR SELECT 
TO public
USING (status = 'approved');