-- Create enum for employment status
CREATE TYPE public.employment_status AS ENUM (
  'onboarding_probation',
  'onboarding_passed',
  'active',
  'inactive_left',
  'inactive_fired'
);

-- Add employment_status column to hr_profiles
ALTER TABLE public.hr_profiles 
ADD COLUMN employment_status public.employment_status NOT NULL DEFAULT 'onboarding_probation';