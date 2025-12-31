-- Create table to track exceptions (deletions/modifications) to recurring patterns
CREATE TABLE public.shift_pattern_exceptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_id UUID NOT NULL REFERENCES public.recurring_shift_patterns(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type TEXT NOT NULL DEFAULT 'deleted', -- 'deleted' or 'modified' 
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(pattern_id, exception_date)
);

-- Enable RLS
ALTER TABLE public.shift_pattern_exceptions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all exceptions
CREATE POLICY "Admins can manage shift exceptions" 
ON public.shift_pattern_exceptions 
FOR ALL 
USING (get_current_user_role() = 'admin');

-- Users can view their own pattern exceptions
CREATE POLICY "Users can view their own pattern exceptions" 
ON public.shift_pattern_exceptions 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM recurring_shift_patterns p 
    WHERE p.id = shift_pattern_exceptions.pattern_id 
    AND p.user_id = auth.uid()
  )
);