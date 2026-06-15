-- Performance rating (tier rank) per staff member.
ALTER TABLE public.hr_profiles
  ADD COLUMN IF NOT EXISTS performance_rating text
  CHECK (performance_rating IS NULL OR performance_rating IN ('S','A','B','C','D'));
