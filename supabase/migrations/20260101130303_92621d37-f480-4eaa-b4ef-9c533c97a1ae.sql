-- Allow public/anonymous users to read staff schedules (for public schedule sharing)
CREATE POLICY "Public can view staff schedules"
ON public.staff_schedules
FOR SELECT
TO anon
USING (true);

-- Allow public/anonymous users to read recurring shift patterns (non-overtime only for public view)
CREATE POLICY "Public can view recurring shift patterns"
ON public.recurring_shift_patterns
FOR SELECT
TO anon
USING (is_overtime = false);

-- Allow public/anonymous users to read profiles (for staff names)
CREATE POLICY "Public can view profiles"
ON public.profiles
FOR SELECT
TO anon
USING (true);