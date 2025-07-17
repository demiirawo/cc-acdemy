-- Add position column for proper page ordering
ALTER TABLE pages ADD COLUMN sort_order INTEGER;

-- Update existing pages to have sort_order based on creation date
WITH ordered_pages AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY 
      COALESCE(parent_page_id::text, 'root'),
      COALESCE(space_id::text, 'none')
    ORDER BY created_at
  ) as row_num
  FROM pages
)
UPDATE pages 
SET sort_order = ordered_pages.row_num * 1000
FROM ordered_pages 
WHERE pages.id = ordered_pages.id;

-- Add index for better performance
CREATE INDEX idx_pages_sort_order ON pages(sort_order, parent_page_id, space_id);

-- Function to get next sort order for new pages
CREATE OR REPLACE FUNCTION get_next_sort_order(p_parent_page_id uuid, p_space_id uuid)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  max_order INTEGER;
BEGIN
  SELECT COALESCE(MAX(sort_order), 0) + 1000
  INTO max_order
  FROM pages
  WHERE 
    (parent_page_id = p_parent_page_id OR (parent_page_id IS NULL AND p_parent_page_id IS NULL))
    AND (space_id = p_space_id OR (space_id IS NULL AND p_space_id IS NULL));
  
  RETURN max_order;
END;
$$;

-- Function to move page up (swap positions)
CREATE OR REPLACE FUNCTION move_page_up(page_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  current_page RECORD;
  previous_page RECORD;
  temp_order INTEGER;
BEGIN
  -- Get current page
  SELECT * INTO current_page FROM pages WHERE id = page_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Find previous page (next lower sort_order)
  SELECT * INTO previous_page 
  FROM pages 
  WHERE 
    (parent_page_id = current_page.parent_page_id OR (parent_page_id IS NULL AND current_page.parent_page_id IS NULL))
    AND (space_id = current_page.space_id OR (space_id IS NULL AND current_page.space_id IS NULL))
    AND sort_order < current_page.sort_order
  ORDER BY sort_order DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN FALSE; -- Already at top
  END IF;
  
  -- Swap positions
  temp_order := current_page.sort_order;
  
  UPDATE pages SET sort_order = previous_page.sort_order WHERE id = current_page.id;
  UPDATE pages SET sort_order = temp_order WHERE id = previous_page.id;
  
  RETURN TRUE;
END;
$$;

-- Function to move page down (swap positions)
CREATE OR REPLACE FUNCTION move_page_down(page_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  current_page RECORD;
  next_page RECORD;
  temp_order INTEGER;
BEGIN
  -- Get current page
  SELECT * INTO current_page FROM pages WHERE id = page_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Find next page (next higher sort_order)
  SELECT * INTO next_page 
  FROM pages 
  WHERE 
    (parent_page_id = current_page.parent_page_id OR (parent_page_id IS NULL AND current_page.parent_page_id IS NULL))
    AND (space_id = current_page.space_id OR (space_id IS NULL AND current_page.space_id IS NULL))
    AND sort_order > current_page.sort_order
  ORDER BY sort_order ASC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN FALSE; -- Already at bottom
  END IF;
  
  -- Swap positions
  temp_order := current_page.sort_order;
  
  UPDATE pages SET sort_order = next_page.sort_order WHERE id = current_page.id;
  UPDATE pages SET sort_order = temp_order WHERE id = next_page.id;
  
  RETURN TRUE;
END;
$$;