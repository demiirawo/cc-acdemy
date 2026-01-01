-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Public can view recurring shift patterns" ON recurring_shift_patterns;

-- Create new policy that allows public to view ALL recurring shift patterns (including overtime)
CREATE POLICY "Public can view recurring shift patterns" 
ON recurring_shift_patterns 
FOR SELECT 
USING (true);