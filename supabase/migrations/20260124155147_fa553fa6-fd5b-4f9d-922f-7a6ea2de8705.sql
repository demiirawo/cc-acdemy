-- Allow scheduling editors to update staff_holidays (for cover requirement management)
CREATE POLICY "Editors can update cover requirements"
ON public.staff_holidays
FOR UPDATE
TO authenticated
USING (
  get_current_user_role() = 'admin' 
  OR is_scheduling_editor(auth.uid())
)
WITH CHECK (
  get_current_user_role() = 'admin' 
  OR is_scheduling_editor(auth.uid())
);