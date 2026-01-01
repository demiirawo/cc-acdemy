-- Add public SELECT policy for staff_holidays (for public schedule to show holiday info)
CREATE POLICY "Public can view approved holidays" 
ON public.staff_holidays 
FOR SELECT 
USING (status = 'approved');

-- Add public SELECT policy for staff_requests (for public schedule to show coverage info)
CREATE POLICY "Public can view approved staff requests" 
ON public.staff_requests 
FOR SELECT 
USING (status = 'approved');