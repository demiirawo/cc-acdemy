-- Add a flag to indicate holiday does not require cover
ALTER TABLE public.staff_holidays
ADD COLUMN IF NOT EXISTS no_cover_required boolean NOT NULL DEFAULT false;