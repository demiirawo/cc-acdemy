-- Create a simpler whiteboard table for client notes (single shared note per client)
CREATE TABLE public.client_whiteboards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL UNIQUE,
  content text NOT NULL DEFAULT '',
  last_updated_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_whiteboards ENABLE ROW LEVEL SECURITY;

-- Allow public to view and update whiteboard
CREATE POLICY "Public can view client whiteboards"
ON public.client_whiteboards
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Public can insert client whiteboards"
ON public.client_whiteboards
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Public can update client whiteboards"
ON public.client_whiteboards
FOR UPDATE
TO anon, authenticated
USING (true);

-- Create updated_at trigger
CREATE TRIGGER update_client_whiteboards_updated_at
  BEFORE UPDATE ON public.client_whiteboards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();