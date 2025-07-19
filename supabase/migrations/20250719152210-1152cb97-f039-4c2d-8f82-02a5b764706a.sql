-- Add category_order column to store ordered categories array
ALTER TABLE public.pages ADD COLUMN category_order TEXT[] DEFAULT '{}';

-- Add comment to explain the column
COMMENT ON COLUMN public.pages.category_order IS 'Array storing the order of categories as they first appear in recommended_reading';