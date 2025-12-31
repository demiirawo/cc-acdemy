-- Update default holiday allowance to 15 days
ALTER TABLE public.hr_profiles 
ALTER COLUMN annual_holiday_allowance SET DEFAULT 15;

-- Update existing records that have 28 to 15 (if they haven't been customized)
UPDATE public.hr_profiles 
SET annual_holiday_allowance = 15 
WHERE annual_holiday_allowance = 28;