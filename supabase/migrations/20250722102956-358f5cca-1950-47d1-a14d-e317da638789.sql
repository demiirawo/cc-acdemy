-- Add a policy to allow anyone to check if an email exists in the exceptions list
-- This is needed for the registration process to work for non-care-cuddle emails
CREATE POLICY "Anyone can check email exceptions for registration" 
ON public.email_exceptions 
FOR SELECT 
USING (true);