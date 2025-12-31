-- Add recurrence_interval column to recurring_shift_patterns
-- This allows specifying how often the pattern repeats:
-- 'weekly' = every week (default, current behavior)
-- 'biweekly' = every other week  
-- 'monthly' = once per month
-- 'daily' = every day (ignores days_of_week)

ALTER TABLE public.recurring_shift_patterns 
ADD COLUMN recurrence_interval text NOT NULL DEFAULT 'weekly';

-- Add a constraint to ensure valid values
ALTER TABLE public.recurring_shift_patterns 
ADD CONSTRAINT recurring_shift_patterns_recurrence_interval_check 
CHECK (recurrence_interval IN ('daily', 'weekly', 'biweekly', 'monthly'));