-- Drop the existing check constraint
ALTER TABLE public.recurring_shift_patterns 
DROP CONSTRAINT recurring_shift_patterns_recurrence_interval_check;

-- Add a new check constraint that includes 'one_off'
ALTER TABLE public.recurring_shift_patterns 
ADD CONSTRAINT recurring_shift_patterns_recurrence_interval_check 
CHECK (recurrence_interval = ANY (ARRAY['daily'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text, 'one_off'::text]));