ALTER TABLE public.hr_profiles
ADD COLUMN IF NOT EXISTS public_holiday_pay_disabled boolean NOT NULL DEFAULT false;