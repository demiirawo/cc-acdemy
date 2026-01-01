-- Fix recurring_shift_patterns RLS policies
-- Drop the overly permissive "Public can view" policy
DROP POLICY IF EXISTS "Public can view recurring shift patterns" ON public.recurring_shift_patterns;

-- Create a proper policy for authenticated users to only see patterns for clients they're assigned to or their own patterns
CREATE POLICY "Users can view recurring patterns for their clients"
ON public.recurring_shift_patterns
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  OR get_current_user_role() = 'admin'
  OR can_view_schedule_for_client(auth.uid(), client_name)
);

-- Fix staff_holidays RLS policies  
-- Drop the overly permissive public policy for authenticated users
DROP POLICY IF EXISTS "Public can view approved holidays" ON public.staff_holidays;
DROP POLICY IF EXISTS "Public can update approved holidays" ON public.staff_holidays;
DROP POLICY IF EXISTS "Public can delete approved holidays" ON public.staff_holidays;

-- Re-create these policies for anon only (for public schedule sharing feature)
CREATE POLICY "Anon can view approved holidays"
ON public.staff_holidays
FOR SELECT
TO anon
USING (status = 'approved');

-- For authenticated users, they can only see holidays for staff assigned to their clients (for coverage visibility)
CREATE POLICY "Authenticated users can view holidays for their clients"
ON public.staff_holidays
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR get_current_user_role() = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.staff_client_assignments sca
    WHERE sca.staff_user_id = staff_holidays.user_id
    AND can_view_schedule_for_client(auth.uid(), sca.client_name)
  )
);

-- Fix staff_requests RLS policies
-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view approved staff requests" ON public.staff_requests;

-- Re-create for anon only
CREATE POLICY "Anon can view approved staff requests"
ON public.staff_requests
FOR SELECT
TO anon
USING (status = 'approved');

-- For authenticated users - only see their own or requests from colleagues at shared clients
CREATE POLICY "Authenticated users can view requests for their clients"
ON public.staff_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() = swap_with_user_id
  OR get_current_user_role() = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.staff_client_assignments sca
    WHERE sca.staff_user_id = staff_requests.user_id
    AND can_view_schedule_for_client(auth.uid(), sca.client_name)
  )
);

-- Update recurring_shift_patterns editor policy to also respect client restrictions
DROP POLICY IF EXISTS "Admins can manage all recurring patterns" ON public.recurring_shift_patterns;

CREATE POLICY "Admins can manage all recurring patterns"
ON public.recurring_shift_patterns
FOR ALL
TO authenticated
USING (get_current_user_role() = 'admin')
WITH CHECK (get_current_user_role() = 'admin');

-- Add policy for scheduling editors to manage patterns for their clients
CREATE POLICY "Editors can manage recurring patterns for their clients"
ON public.recurring_shift_patterns
FOR ALL
TO authenticated
USING (
  is_scheduling_editor(auth.uid()) 
  AND can_view_schedule_for_client(auth.uid(), client_name)
)
WITH CHECK (
  is_scheduling_editor(auth.uid()) 
  AND can_view_schedule_for_client(auth.uid(), client_name)
);