-- Create table for recurring shift patterns
CREATE TABLE public.recurring_shift_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  days_of_week INTEGER[] NOT NULL, -- 0=Sunday, 1=Monday, etc.
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  hourly_rate NUMERIC,
  currency TEXT NOT NULL DEFAULT 'GBP',
  is_overtime BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  start_date DATE NOT NULL, -- When the pattern begins
  end_date DATE, -- NULL means indefinite
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recurring_shift_patterns ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage all recurring patterns"
ON public.recurring_shift_patterns
FOR ALL
USING (get_current_user_role() = 'admin');

CREATE POLICY "Users can view their own recurring patterns"
ON public.recurring_shift_patterns
FOR SELECT
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_recurring_shift_patterns_updated_at
BEFORE UPDATE ON public.recurring_shift_patterns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();