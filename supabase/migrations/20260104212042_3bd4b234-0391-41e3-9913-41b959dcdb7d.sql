-- Add client_informed field to staff_requests for holiday requests
ALTER TABLE public.staff_requests 
ADD COLUMN IF NOT EXISTS client_informed BOOLEAN DEFAULT FALSE;