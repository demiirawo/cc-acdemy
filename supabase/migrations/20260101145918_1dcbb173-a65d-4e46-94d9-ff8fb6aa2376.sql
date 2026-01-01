-- Add policies for public users to update and delete approved holidays
-- This allows editing/deleting from the public client schedule view

CREATE POLICY "Public can update approved holidays"
ON public.staff_holidays
FOR UPDATE
USING (status = 'approved')
WITH CHECK (status = 'approved');

CREATE POLICY "Public can delete approved holidays"
ON public.staff_holidays
FOR DELETE
USING (status = 'approved');