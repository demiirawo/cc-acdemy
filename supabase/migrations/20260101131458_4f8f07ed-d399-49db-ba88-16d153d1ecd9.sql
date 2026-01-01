-- Add URL field to client_passwords table for storing links
ALTER TABLE public.client_passwords
ADD COLUMN url text;