-- Add policy to allow users to delete their own quiz completions (for retakes)
CREATE POLICY "Users can delete their own quiz completions"
ON public.quiz_completions FOR DELETE
USING (auth.uid() = user_id);

-- Add policy to allow admins to manage all quiz completions
CREATE POLICY "Admins can manage quiz completions"
ON public.quiz_completions FOR ALL
USING (get_current_user_role() = 'admin');