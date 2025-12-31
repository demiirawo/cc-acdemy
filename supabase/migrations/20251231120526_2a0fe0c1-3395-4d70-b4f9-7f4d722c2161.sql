-- Create staff_schedules table for client allocations
CREATE TABLE public.staff_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  hourly_rate NUMERIC,
  currency TEXT NOT NULL DEFAULT 'GBP',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff_overtime table for manual overtime entries
CREATE TABLE public.staff_overtime (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  schedule_id UUID REFERENCES public.staff_schedules(id) ON DELETE SET NULL,
  overtime_date DATE NOT NULL,
  hours NUMERIC NOT NULL,
  hourly_rate NUMERIC,
  currency TEXT NOT NULL DEFAULT 'GBP',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_overtime ENABLE ROW LEVEL SECURITY;

-- RLS policies for staff_schedules
CREATE POLICY "Admins can manage all schedules" 
ON public.staff_schedules 
FOR ALL 
USING (get_current_user_role() = 'admin');

CREATE POLICY "Users can view their own schedules" 
ON public.staff_schedules 
FOR SELECT 
USING (auth.uid() = user_id);

-- RLS policies for staff_overtime
CREATE POLICY "Admins can manage all overtime" 
ON public.staff_overtime 
FOR ALL 
USING (get_current_user_role() = 'admin');

CREATE POLICY "Users can view their own overtime" 
ON public.staff_overtime 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_staff_schedules_user_id ON public.staff_schedules(user_id);
CREATE INDEX idx_staff_schedules_dates ON public.staff_schedules(start_datetime, end_datetime);
CREATE INDEX idx_staff_overtime_user_id ON public.staff_overtime(user_id);
CREATE INDEX idx_staff_overtime_date ON public.staff_overtime(overtime_date);