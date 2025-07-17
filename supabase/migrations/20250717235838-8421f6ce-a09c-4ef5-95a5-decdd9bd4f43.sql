-- Fix remaining function security issues
-- Add secure search_path to all remaining functions

CREATE OR REPLACE FUNCTION public.get_next_sort_order(p_parent_page_id uuid, p_space_id uuid)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.move_page_up(page_id uuid)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.move_page_down(page_id uuid)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';