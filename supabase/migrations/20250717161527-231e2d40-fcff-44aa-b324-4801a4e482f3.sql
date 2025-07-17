-- Add DELETE policy for pages table
CREATE POLICY "Users can delete their own pages" 
ON public.pages 
FOR DELETE 
USING (auth.uid() = created_by);

-- Add DELETE policy for admin users
CREATE POLICY "Admins can delete all pages" 
ON public.pages 
FOR DELETE 
USING (get_current_user_role() = 'admin'::text);