-- Create table for email exceptions that can bypass domain restrictions
CREATE TABLE public.email_exceptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.email_exceptions ENABLE ROW LEVEL SECURITY;

-- Create policies for email exceptions
CREATE POLICY "Admins can manage email exceptions" 
ON public.email_exceptions 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'admin'
));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_email_exceptions_updated_at
BEFORE UPDATE ON public.email_exceptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();