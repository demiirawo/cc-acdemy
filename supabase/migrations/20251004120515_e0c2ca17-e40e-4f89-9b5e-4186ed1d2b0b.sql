-- Function to move a page up in the hierarchy
CREATE OR REPLACE FUNCTION move_page_up_enhanced(
  p_page_id UUID,
  p_expected_version INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_page RECORD;
  v_previous_page RECORD;
  v_temp_order INTEGER;
BEGIN
  -- Get the current page
  SELECT id, parent_page_id, space_id, sort_order, title
  INTO v_current_page
  FROM pages
  WHERE id = p_page_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page not found'
    );
  END IF;

  -- Find the previous page (same parent, lower sort_order)
  SELECT id, sort_order
  INTO v_previous_page
  FROM pages
  WHERE 
    COALESCE(parent_page_id::text, 'NULL') = COALESCE(v_current_page.parent_page_id::text, 'NULL')
    AND COALESCE(space_id::text, 'NULL') = COALESCE(v_current_page.space_id::text, 'NULL')
    AND sort_order < COALESCE(v_current_page.sort_order, 0)
  ORDER BY sort_order DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page is already at the top'
    );
  END IF;

  -- Swap sort orders
  v_temp_order := v_current_page.sort_order;
  
  UPDATE pages
  SET sort_order = v_previous_page.sort_order
  WHERE id = p_page_id;

  UPDATE pages
  SET sort_order = v_temp_order
  WHERE id = v_previous_page.id;

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
$$;

-- Function to move a page down in the hierarchy
CREATE OR REPLACE FUNCTION move_page_down_enhanced(
  p_page_id UUID,
  p_expected_version INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_page RECORD;
  v_next_page RECORD;
  v_temp_order INTEGER;
BEGIN
  -- Get the current page
  SELECT id, parent_page_id, space_id, sort_order, title
  INTO v_current_page
  FROM pages
  WHERE id = p_page_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page not found'
    );
  END IF;

  -- Find the next page (same parent, higher sort_order)
  SELECT id, sort_order
  INTO v_next_page
  FROM pages
  WHERE 
    COALESCE(parent_page_id::text, 'NULL') = COALESCE(v_current_page.parent_page_id::text, 'NULL')
    AND COALESCE(space_id::text, 'NULL') = COALESCE(v_current_page.space_id::text, 'NULL')
    AND sort_order > COALESCE(v_current_page.sort_order, 0)
  ORDER BY sort_order ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page is already at the bottom'
    );
  END IF;

  -- Swap sort orders
  v_temp_order := v_current_page.sort_order;
  
  UPDATE pages
  SET sort_order = v_next_page.sort_order
  WHERE id = p_page_id;

  UPDATE pages
  SET sort_order = v_temp_order
  WHERE id = v_next_page.id;

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
$$;