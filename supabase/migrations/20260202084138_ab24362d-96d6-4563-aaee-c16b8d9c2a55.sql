-- Add unlimited_holiday column to hr_profiles
ALTER TABLE public.hr_profiles
ADD COLUMN unlimited_holiday boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.hr_profiles.unlimited_holiday IS 'When true, staff has unlimited holiday - no accrual, no balance tracking, no June refund';