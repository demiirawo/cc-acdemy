-- Add a category (e.g. "Part A" / "Part B") to training items for grouping.
ALTER TABLE public.training_items
  ADD COLUMN IF NOT EXISTS category text;

-- Backfill the current catalogue: items 1–11 = Part A, 12+ = Part B.
UPDATE public.training_items SET category = 'Part A' WHERE category IS NULL AND sort_order <= 11;
UPDATE public.training_items SET category = 'Part B' WHERE category IS NULL AND sort_order >= 12;
