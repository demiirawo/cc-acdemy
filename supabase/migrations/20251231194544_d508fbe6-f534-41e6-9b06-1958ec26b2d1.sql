-- Create table for recurring bonuses (indefinite until cancelled)
CREATE TABLE public.recurring_bonuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE, -- NULL means indefinite
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recurring_bonuses ENABLE ROW LEVEL SECURITY;

-- Admins can manage all recurring bonuses
CREATE POLICY "Admins can manage recurring bonuses"
  ON public.recurring_bonuses
  FOR ALL
  USING (get_current_user_role() = 'admin');

-- Users can view their own recurring bonuses
CREATE POLICY "Users can view their own recurring bonuses"
  ON public.recurring_bonuses
  FOR SELECT
  USING (auth.uid() = user_id);