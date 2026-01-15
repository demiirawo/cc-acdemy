-- Drop the security definer view and recreate with security_invoker
DROP VIEW IF EXISTS public.hr_profiles_public;

-- Create a safe view with security_invoker=on (respects caller's RLS)
CREATE OR REPLACE VIEW public.hr_profiles_public
WITH (security_invoker = on) AS
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