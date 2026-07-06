-- Target completion dates become per-part (category): one date per staff member
-- per training category (Part A, Part B, ...). Existing whole-matrix targets are
-- preserved by copying the date to every active category for that member.
ALTER TABLE public.training_targets DROP CONSTRAINT IF EXISTS training_targets_pkey;
ALTER TABLE public.training_targets ADD COLUMN IF NOT EXISTS category text;

-- Expand each legacy (category IS NULL) target to one row per active category.
INSERT INTO public.training_targets (user_id, category, target_date, updated_by, updated_at)
SELECT t.user_id, c.category, t.target_date, t.updated_by, t.updated_at
FROM public.training_targets t
CROSS JOIN (
  SELECT DISTINCT COALESCE(category, 'Other') AS category
  FROM public.training_items WHERE is_active = true
) c
WHERE t.category IS NULL;

DELETE FROM public.training_targets WHERE category IS NULL;

ALTER TABLE public.training_targets ALTER COLUMN category SET NOT NULL;
ALTER TABLE public.training_targets ADD PRIMARY KEY (user_id, category);
