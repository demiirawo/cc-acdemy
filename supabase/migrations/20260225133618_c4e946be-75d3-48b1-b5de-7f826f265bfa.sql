
-- Add overtime_subtype column to recurring_shift_patterns
ALTER TABLE public.recurring_shift_patterns
ADD COLUMN overtime_subtype TEXT DEFAULT NULL;

-- Add overtime_subtype column to shift_pattern_exceptions
ALTER TABLE public.shift_pattern_exceptions
ADD COLUMN overtime_subtype TEXT DEFAULT NULL;
