-- Add DELETE policy for profiles table to allow admins to delete profiles
CREATE POLICY "Admins can delete any profile" 
ON public.profiles 
FOR DELETE 
USING (EXISTS ( 
  SELECT 1
  FROM profiles profiles_1
  WHERE (profiles_1.user_id = auth.uid()) 
  AND (profiles_1.role = 'admin'::text)
));