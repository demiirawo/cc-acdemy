-- Add policy to allow public updates on client_passwords
CREATE POLICY "Public can update client passwords" 
ON public.client_passwords 
FOR UPDATE 
USING (true)
WITH CHECK (true);

-- Add policy to allow public deletes on client_passwords (for consistency)
CREATE POLICY "Public can delete client passwords" 
ON public.client_passwords 
FOR DELETE 
USING (true);