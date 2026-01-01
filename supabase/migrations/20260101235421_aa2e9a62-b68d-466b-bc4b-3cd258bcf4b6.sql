-- Add public read access to staff_client_assignments for public schedule pages
CREATE POLICY "Public can view staff client assignments"
ON public.staff_client_assignments
FOR SELECT
USING (true);