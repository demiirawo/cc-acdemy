
-- Add a policy that allows public/anon access to hr_profiles for viewing
-- This matches how the profiles table works and ensures payroll data is visible
CREATE POLICY "Public can view HR profiles for payroll" 
ON public.hr_profiles 
FOR SELECT 
TO anon, public
USING (true);
