
-- Fix the database functions and data cleanup for page movement functionality

-- First, let's update all pages with NULL sort_order to have proper values
WITH ordered_pages AS (
  SELECT 
    id, 
    ROW_NUMBER() OVER (
      PARTITION BY 
        COALESCE(parent_page_id::text, 'root'),
        COALESCE(space_id::text, 'none')
      ORDER BY created_at
    ) * 1000 as new_sort_order
  FROM pages 
  WHERE sort_order IS NULL
)
UPDATE pages 
SET sort_order = ordered_pages.new_sort_order
FROM ordered_pages 
WHERE pages.id = ordered_pages.id;

-- Fix the move_page_up function with proper schema path and error handling
CREATE OR REPLACE FUNCTION public.move_page_up(page_id uuid)
RETURNS BOOLEAN AS $$
DECLARE
  current_page RECORD;
  previous_page RECORD;
  temp_order INTEGER;
BEGIN
  -- Get current page with proper schema reference
  SELECT * INTO current_page FROM public.pages WHERE id = page_id;
  
  IF NOT FOUND THEN
    RAISE LOG 'Page not found: %', page_id;
    RETURN FALSE;
  END IF;
  
  -- Find previous page (next lower sort_order) with proper schema reference
  SELECT * INTO previous_page 
  FROM public.pages 
  WHERE 
    (parent_page_id = current_page.parent_page_id OR (parent_page_id IS NULL AND current_page.parent_page_id IS NULL))
    AND (space_id = current_page.space_id OR (space_id IS NULL AND current_page.space_id IS NULL))
    AND sort_order < current_page.sort_order
  ORDER BY sort_order DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE LOG 'Page already at top: %', page_id;
    RETURN FALSE; -- Already at top
  END IF;
  
  -- Swap positions
  temp_order := current_page.sort_order;
  
  UPDATE public.pages SET sort_order = previous_page.sort_order WHERE id = current_page.id;
  UPDATE public.pages SET sort_order = temp_order WHERE id = previous_page.id;
  
  RAISE LOG 'Successfully moved page up: %', page_id;
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error moving page up: %, Error: %', page_id, SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix the move_page_down function with proper schema path and error handling
CREATE OR REPLACE FUNCTION public.move_page_down(page_id uuid)
RETURNS BOOLEAN AS $$
DECLARE
  current_page RECORD;
  next_page RECORD;
  temp_order INTEGER;
BEGIN
  -- Get current page with proper schema reference
  SELECT * INTO current_page FROM public.pages WHERE id = page_id;
  
  IF NOT FOUND THEN
    RAISE LOG 'Page not found: %', page_id;
    RETURN FALSE;
  END IF;
  
  -- Find next page (next higher sort_order) with proper schema reference
  SELECT * INTO next_page 
  FROM public.pages 
  WHERE 
    (parent_page_id = current_page.parent_page_id OR (parent_page_id IS NULL AND current_page.parent_page_id IS NULL))
    AND (space_id = current_page.space_id OR (space_id IS NULL AND current_page.space_id IS NULL))
    AND sort_order > current_page.sort_order
  ORDER BY sort_order ASC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE LOG 'Page already at bottom: %', page_id;
    RETURN FALSE; -- Already at bottom
  END IF;
  
  -- Swap positions
  temp_order := current_page.sort_order;
  
  UPDATE public.pages SET sort_order = next_page.sort_order WHERE id = current_page.id;
  UPDATE public.pages SET sort_order = temp_order WHERE id = next_page.id;
  
  RAISE LOG 'Successfully moved page down: %', page_id;
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error moving page down: %, Error: %', page_id, SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update the get_next_sort_order function to ensure it works properly
CREATE OR REPLACE FUNCTION public.get_next_sort_order(p_parent_page_id uuid, p_space_id uuid)
RETURNS INTEGER AS $$
DECLARE
  max_order INTEGER;
BEGIN
  SELECT COALESCE(MAX(sort_order), 0) + 1000
  INTO max_order
  FROM public.pages
  WHERE 
    (parent_page_id = p_parent_page_id OR (parent_page_id IS NULL AND p_parent_page_id IS NULL))
    AND (space_id = p_space_id OR (space_id IS NULL AND p_space_id IS NULL));
  
  RETURN max_order;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error getting next sort order: %', SQLERRM;
    RETURN 1000; -- Default fallback
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add a trigger to automatically set sort_order for new pages
CREATE OR REPLACE FUNCTION public.auto_set_sort_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    NEW.sort_order := public.get_next_sort_order(NEW.parent_page_id, NEW.space_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
DROP TRIGGER IF EXISTS set_sort_order_trigger ON public.pages;
CREATE TRIGGER set_sort_order_trigger
  BEFORE INSERT ON public.pages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_sort_order();
