-- Create table for client noticeboard messages
CREATE TABLE public.client_notices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  author_name text NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_notices ENABLE ROW LEVEL SECURITY;

-- Allow public to view and create notices
CREATE POLICY "Public can view client notices"
ON public.client_notices
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Public can create client notices"
ON public.client_notices
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Admins can manage all notices
CREATE POLICY "Admins can manage client notices"
ON public.client_notices
FOR ALL
USING (get_current_user_role() = 'admin');

-- Create table for client software passwords
CREATE TABLE public.client_passwords (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  software_name text NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_passwords ENABLE ROW LEVEL SECURITY;

-- Allow public to view and create passwords
CREATE POLICY "Public can view client passwords"
ON public.client_passwords
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Public can create client passwords"
ON public.client_passwords
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Admins can manage all passwords
CREATE POLICY "Admins can manage client passwords"
ON public.client_passwords
FOR ALL
USING (get_current_user_role() = 'admin');

-- Create updated_at triggers
CREATE TRIGGER update_client_notices_updated_at
  BEFORE UPDATE ON public.client_notices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_passwords_updated_at
  BEFORE UPDATE ON public.client_passwords
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();