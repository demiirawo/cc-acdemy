-- Create glossary table for storing definitions
CREATE TABLE public.glossary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  term TEXT NOT NULL UNIQUE,
  definition TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.glossary ENABLE ROW LEVEL SECURITY;

-- Create policies for glossary access
CREATE POLICY "Everyone can view glossary terms" 
ON public.glossary 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage glossary terms" 
ON public.glossary 
FOR ALL 
USING (public.get_current_user_role() = 'admin')
WITH CHECK (public.get_current_user_role() = 'admin');

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_glossary_updated_at
BEFORE UPDATE ON public.glossary
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();