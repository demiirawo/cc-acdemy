-- Add base_salary to hr_profiles
ALTER TABLE public.hr_profiles 
ADD COLUMN base_salary NUMERIC DEFAULT NULL,
ADD COLUMN pay_frequency TEXT DEFAULT 'monthly';