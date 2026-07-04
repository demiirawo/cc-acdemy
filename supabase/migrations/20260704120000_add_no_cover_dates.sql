-- Per-day "no cover required": specific dates within an approved absence that do
-- not need a cover person. Complements the existing whole-holiday
-- staff_holidays.no_cover_required boolean. A day needs cover only if it is a
-- scheduled shift day AND not covered AND not in no_cover_dates AND the whole
-- holiday isn't flagged no_cover_required.
ALTER TABLE public.staff_holidays
  ADD COLUMN IF NOT EXISTS no_cover_dates text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.staff_holidays.no_cover_dates IS
  'Specific dates (yyyy-MM-dd) within the absence that do not require cover.';
