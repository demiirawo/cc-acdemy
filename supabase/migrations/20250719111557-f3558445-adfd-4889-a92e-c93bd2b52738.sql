-- Add sort_order column to pages table
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Add version column to pages table if it doesn't exist
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create index for better performance on sort_order queries
CREATE INDEX IF NOT EXISTS idx_pages_sort_order ON public.pages(parent_page_id, space_id, sort_order);

-- Update existing pages to have sort_order values
UPDATE public.pages 
SET sort_order = (
  SELECT ROW_NUMBER() OVER (
    PARTITION BY parent_page_id, space_id 
    ORDER BY created_at
  ) * 1000
)
WHERE sort_order IS NULL;