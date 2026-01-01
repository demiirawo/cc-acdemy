-- Add scheduling_role column to hr_profiles
-- Default is 'viewer', options are 'viewer' or 'editor'
ALTER TABLE public.hr_profiles 
ADD COLUMN scheduling_role text NOT NULL DEFAULT 'viewer';

-- Add a check constraint to ensure valid values
ALTER TABLE public.hr_profiles 
ADD CONSTRAINT hr_profiles_scheduling_role_check 
CHECK (scheduling_role IN ('viewer', 'editor'));

-- Create a security definer function to check if user is a scheduling editor
CREATE OR REPLACE FUNCTION public.is_scheduling_editor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_profiles
    WHERE user_id = _user_id
      AND scheduling_role = 'editor'
  )
$$;

-- Create a security definer function to get clients a user can view schedules for
-- This includes: clients they're assigned to, clients they're covering (via staff_schedules), or all if they're an editor
CREATE OR REPLACE FUNCTION public.can_view_schedule_for_client(_user_id uuid, _client_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- User is assigned to this client
    SELECT 1 FROM public.staff_client_assignments
    WHERE staff_user_id = _user_id AND client_name = _client_name
  )
  OR EXISTS (
    -- User has a schedule at this client (covering)
    SELECT 1 FROM public.staff_schedules
    WHERE user_id = _user_id AND client_name = _client_name
  )
  OR EXISTS (
    -- User is an admin
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role = 'admin'
  )
$$;

-- Update RLS policies for staff_schedules to enforce editor role for modifications
-- First drop the existing admin-only policy for managing schedules
DROP POLICY IF EXISTS "Admins can manage all schedules" ON public.staff_schedules;

-- Create new policies: Admins and scheduling editors can manage schedules
CREATE POLICY "Admins and editors can manage schedules" 
ON public.staff_schedules 
FOR ALL 
USING (
  get_current_user_role() = 'admin' 
  OR is_scheduling_editor(auth.uid())
);

-- Update the view policy to include the client visibility rules
DROP POLICY IF EXISTS "Users can view their own schedules" ON public.staff_schedules;
DROP POLICY IF EXISTS "Public can view staff schedules" ON public.staff_schedules;

-- Staff can view schedules for clients they have access to
CREATE POLICY "Staff can view schedules for their clients" 
ON public.staff_schedules 
FOR SELECT 
USING (
  -- Admins can see all
  get_current_user_role() = 'admin'
  -- Editors can see all
  OR is_scheduling_editor(auth.uid())
  -- Users can see schedules for clients they're linked to or covering
  OR can_view_schedule_for_client(auth.uid(), client_name)
  -- Users can always see their own schedules
  OR auth.uid() = user_id
);