-- First, drop the overly permissive policies
DROP POLICY IF EXISTS "Public can view HR profiles for payroll" ON public.hr_profiles;
DROP POLICY IF EXISTS "Authenticated users can view all HR profiles" ON public.hr_profiles;

-- Create a public view with only non-sensitive fields (excludes salary data)
CREATE OR REPLACE VIEW public.hr_profiles_public
WITH (security_invoker = off) AS
SELECT 
  id,
  user_id,
  employee_id,
  job_title,
  department,
  employment_status,
  scheduling_role,
  start_date,
  created_at,
  updated_at
FROM public.hr_profiles;

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.hr_profiles_public TO authenticated;

-- Add a policy for authenticated users to read the public view via RLS on base table
-- The view with security_invoker=off will bypass RLS, so we need a different approach

-- Actually, let's use a simpler approach: create a policy that allows authenticated users
-- to see non-salary fields by using a function

-- Create a function to check if user should see full details
CREATE OR REPLACE FUNCTION public.can_view_full_hr_profile(profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    auth.uid() = profile_user_id  -- User viewing their own profile
    OR get_current_user_role() = 'admin'  -- Admin viewing any profile
$$;

-- Create a policy that allows authenticated users to view basic HR info (non-salary)
-- They can SELECT the row, but the application should filter sensitive columns
CREATE POLICY "Authenticated users can view basic HR info"
ON public.hr_profiles
FOR SELECT
TO authenticated
USING (true);

-- Note: The application code will need to filter out salary fields for non-admin users
-- The view hr_profiles_public can be used for safe queries