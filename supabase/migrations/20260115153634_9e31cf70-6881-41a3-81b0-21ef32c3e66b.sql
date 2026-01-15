
-- Drop the existing policy that doesn't work for anon role
DROP POLICY IF EXISTS "All authenticated users can view anniversaries" ON public.hr_profiles;

-- Create a new policy that allows all authenticated users to view hr_profiles
-- This is needed for payroll functionality where admins need to see all staff data
CREATE POLICY "Authenticated users can view all HR profiles" 
ON public.hr_profiles 
FOR SELECT 
TO authenticated
USING (true);

-- Also create a policy for anon role that allows viewing if the request has a valid admin session
-- Since get_current_user_role() doesn't work without auth.uid(), we need to check differently
-- For now, let's just ensure authenticated users can see the data properly
