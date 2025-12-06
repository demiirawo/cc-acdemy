
-- First, fix any duplicate sort_order values within the same parent scope
-- This CTE assigns unique sequential sort orders

-- Create improved move_page_up_enhanced function with proper reordering
CREATE OR REPLACE FUNCTION public.move_page_up_enhanced(p_page_id uuid, p_expected_version integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_page RECORD;
  v_previous_page RECORD;
  v_current_sort INTEGER;
  v_previous_sort INTEGER;
BEGIN
  -- Get the current page
  SELECT id, parent_page_id, space_id, sort_order, title, deleted_at
  INTO v_current_page
  FROM pages
  WHERE id = p_page_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page not found'
    );
  END IF;

  -- Find the previous page (same parent, immediately lower sort_order)
  SELECT id, sort_order
  INTO v_previous_page
  FROM pages
  WHERE 
    COALESCE(parent_page_id::text, 'NULL') = COALESCE(v_current_page.parent_page_id::text, 'NULL')
    AND COALESCE(space_id::text, 'NULL') = COALESCE(v_current_page.space_id::text, 'NULL')
    AND deleted_at IS NULL
    AND sort_order < COALESCE(v_current_page.sort_order, 0)
  ORDER BY sort_order DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page is already at the top'
    );
  END IF;

  -- Store values
  v_current_sort := v_current_page.sort_order;
  v_previous_sort := v_previous_page.sort_order;

  -- If sort orders are the same (shouldn't happen but handle it), create a gap
  IF v_current_sort = v_previous_sort THEN
    v_previous_sort := v_previous_sort - 1000;
  END IF;

  -- Swap by assigning: current gets previous's order, previous gets current's order
  UPDATE pages SET sort_order = v_previous_sort WHERE id = p_page_id;
  UPDATE pages SET sort_order = v_current_sort WHERE id = v_previous_page.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Page moved up successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;

-- Create improved move_page_down_enhanced function with proper reordering
CREATE OR REPLACE FUNCTION public.move_page_down_enhanced(p_page_id uuid, p_expected_version integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_page RECORD;
  v_next_page RECORD;
  v_current_sort INTEGER;
  v_next_sort INTEGER;
BEGIN
  -- Get the current page
  SELECT id, parent_page_id, space_id, sort_order, title, deleted_at
  INTO v_current_page
  FROM pages
  WHERE id = p_page_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page not found'
    );
  END IF;

  -- Find the next page (same parent, immediately higher sort_order)
  SELECT id, sort_order
  INTO v_next_page
  FROM pages
  WHERE 
    COALESCE(parent_page_id::text, 'NULL') = COALESCE(v_current_page.parent_page_id::text, 'NULL')
    AND COALESCE(space_id::text, 'NULL') = COALESCE(v_current_page.space_id::text, 'NULL')
    AND deleted_at IS NULL
    AND sort_order > COALESCE(v_current_page.sort_order, 0)
  ORDER BY sort_order ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page is already at the bottom'
    );
  END IF;

  -- Store values
  v_current_sort := v_current_page.sort_order;
  v_next_sort := v_next_page.sort_order;

  -- If sort orders are the same (shouldn't happen but handle it), create a gap
  IF v_current_sort = v_next_sort THEN
    v_next_sort := v_next_sort + 1000;
  END IF;

  -- Swap by assigning: current gets next's order, next gets current's order
  UPDATE pages SET sort_order = v_next_sort WHERE id = p_page_id;
  UPDATE pages SET sort_order = v_current_sort WHERE id = v_next_page.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Page moved down successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;

-- Fix existing duplicate sort_order values by resequencing within each parent group
DO $$
DECLARE
  parent_record RECORD;
  page_record RECORD;
  new_order INTEGER;
BEGIN
  -- Loop through each distinct parent_page_id/space_id combination
  FOR parent_record IN 
    SELECT DISTINCT 
      COALESCE(parent_page_id::text, 'NULL') as parent_key,
      parent_page_id,
      space_id
    FROM pages 
    WHERE deleted_at IS NULL
  LOOP
    new_order := 1000;
    
    -- Update each page in this group with sequential sort orders
    FOR page_record IN 
      SELECT id 
      FROM pages 
      WHERE 
        COALESCE(parent_page_id::text, 'NULL') = parent_record.parent_key
        AND COALESCE(space_id::text, 'NULL') = COALESCE(parent_record.space_id::text, 'NULL')
        AND deleted_at IS NULL
      ORDER BY COALESCE(sort_order, 999999), created_at
    LOOP
      UPDATE pages SET sort_order = new_order WHERE id = page_record.id;
      new_order := new_order + 1000;
    END LOOP;
  END LOOP;
END $$;
