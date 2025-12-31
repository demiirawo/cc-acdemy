-- Add shift_type column to staff_schedules
ALTER TABLE public.staff_schedules 
ADD COLUMN shift_type text DEFAULT NULL;

-- Add shift_type column to recurring_shift_patterns
ALTER TABLE public.recurring_shift_patterns 
ADD COLUMN shift_type text DEFAULT NULL;