-- Drop the existing policies and recreate with correct logic
DROP POLICY IF EXISTS "Admins and editors can manage schedules" ON public.staff_schedules;
DROP POLICY IF EXISTS "Staff can view schedules for their clients" ON public.staff_schedules;

-- Editors can manage (INSERT, UPDATE, DELETE) schedules for clients they have access to
CREATE POLICY "Editors can manage schedules for their clients" 
ON public.staff_schedules 
FOR ALL 
USING (
  -- Admins can manage all
  get_current_user_role() = 'admin'
  -- Editors can manage schedules for clients they have access to
  OR (
    is_scheduling_editor(auth.uid()) 
    AND can_view_schedule_for_client(auth.uid(), client_name)
  )
);

-- All staff can view schedules for clients they have access to
CREATE POLICY "Staff can view schedules for their clients" 
ON public.staff_schedules 
FOR SELECT 
USING (
  -- Admins can see all
  get_current_user_role() = 'admin'
  -- Users can see schedules for clients they're linked to or covering
  OR can_view_schedule_for_client(auth.uid(), client_name)
  -- Users can always see their own schedules
  OR auth.uid() = user_id
);