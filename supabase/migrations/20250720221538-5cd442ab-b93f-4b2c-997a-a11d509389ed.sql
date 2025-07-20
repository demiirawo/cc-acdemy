-- Final Security Migration: Fix Remaining Function Search Paths
-- Update all remaining functions to have secure search paths

CREATE OR REPLACE FUNCTION public.auto_set_sort_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    NEW.sort_order := public.get_next_sort_order(NEW.parent_page_id, NEW.space_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations 
  SET last_message_at = NOW(), updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_page_operation(p_page_id uuid, p_operation_type text, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb, p_error_message text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.page_audit_log (
    page_id, operation_type, old_values, new_values, user_id, error_message
  ) VALUES (
    p_page_id, p_operation_type, p_old_values, p_new_values, auth.uid(), p_error_message
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_project_memory(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_summary JSONB;
  conversation_count INTEGER;
  recent_topics TEXT[];
BEGIN
  -- Count conversations in project
  SELECT COUNT(*) INTO conversation_count
  FROM public.conversations
  WHERE folder_id = p_project_id;
  
  -- Get recent conversation topics (simplified)
  SELECT ARRAY_AGG(title) INTO recent_topics
  FROM (
    SELECT title 
    FROM public.conversations 
    WHERE folder_id = p_project_id 
    ORDER BY last_message_at DESC 
    LIMIT 10
  ) recent;
  
  -- Build project memory summary
  project_summary := jsonb_build_object(
    'conversation_count', conversation_count,
    'recent_topics', recent_topics,
    'last_updated', now()
  );
  
  -- Update project settings with memory data
  UPDATE public.chat_folders
  SET settings = settings || jsonb_build_object('memory', project_summary)
  WHERE id = p_project_id;
  
  RETURN project_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_page_up(page_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.move_page_down_safe(p_page_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_page RECORD;
  next_page RECORD;
  temp_order INTEGER;
  result JSONB;
BEGIN
  -- Start transaction
  BEGIN
    -- Get current page with version check
    SELECT * INTO current_page 
    FROM public.pages 
    WHERE id = p_page_id AND version = p_expected_version
    FOR UPDATE;
    
    IF NOT FOUND THEN
      result := jsonb_build_object(
        'success', false,
        'error', 'Page not found or version mismatch',
        'code', 'VERSION_CONFLICT'
      );
      
      PERFORM public.log_page_operation(
        p_page_id, 'move_down', NULL, NULL, 'Page not found or version mismatch'
      );
      
      RETURN result;
    END IF;
    
    -- Find next page with lock
    SELECT * INTO next_page 
    FROM public.pages 
    WHERE 
      (parent_page_id = current_page.parent_page_id OR (parent_page_id IS NULL AND current_page.parent_page_id IS NULL))
      AND (space_id = current_page.space_id OR (space_id IS NULL AND current_page.space_id IS NULL))
      AND sort_order > current_page.sort_order
    ORDER BY sort_order ASC
    LIMIT 1
    FOR UPDATE;
    
    IF NOT FOUND THEN
      result := jsonb_build_object(
        'success', false,
        'error', 'Page already at bottom',
        'code', 'ALREADY_AT_BOTTOM'
      );
      
      PERFORM public.log_page_operation(
        p_page_id, 'move_down', NULL, NULL, 'Page already at bottom'
      );
      
      RETURN result;
    END IF;
    
    -- Swap positions and increment versions
    temp_order := current_page.sort_order;
    
    UPDATE public.pages 
    SET sort_order = next_page.sort_order, version = version + 1 
    WHERE id = current_page.id;
    
    UPDATE public.pages 
    SET sort_order = temp_order, version = version + 1 
    WHERE id = next_page.id;
    
    -- Log successful operation
    PERFORM public.log_page_operation(
      p_page_id, 
      'move_down',
      jsonb_build_object('sort_order', current_page.sort_order),
      jsonb_build_object('sort_order', next_page.sort_order)
    );
    
    result := jsonb_build_object(
      'success', true,
      'new_version', current_page.version + 1,
      'message', 'Page moved down successfully'
    );
    
    RETURN result;
    
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM public.log_page_operation(
        p_page_id, 'move_down', NULL, NULL, SQLERRM
      );
      
      result := jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'TRANSACTION_ERROR'
      );
      
      RETURN result;
  END;
END;
$$;

-- Continue with remaining functions...
CREATE OR REPLACE FUNCTION public.move_page_up_safe(p_page_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_page RECORD;
  previous_page RECORD;
  temp_order INTEGER;
  result JSONB;
BEGIN
  -- Start transaction
  BEGIN
    -- Get current page with version check
    SELECT * INTO current_page 
    FROM public.pages 
    WHERE id = p_page_id AND version = p_expected_version
    FOR UPDATE;
    
    IF NOT FOUND THEN
      result := jsonb_build_object(
        'success', false,
        'error', 'Page not found or version mismatch',
        'code', 'VERSION_CONFLICT'
      );
      
      PERFORM public.log_page_operation(
        p_page_id, 'move_up', NULL, NULL, 'Page not found or version mismatch'
      );
      
      RETURN result;
    END IF;
    
    -- Find previous page with lock
    SELECT * INTO previous_page 
    FROM public.pages 
    WHERE 
      (parent_page_id = current_page.parent_page_id OR (parent_page_id IS NULL AND current_page.parent_page_id IS NULL))
      AND (space_id = current_page.space_id OR (space_id IS NULL AND current_page.space_id IS NULL))
      AND sort_order < current_page.sort_order
    ORDER BY sort_order DESC
    LIMIT 1
    FOR UPDATE;
    
    IF NOT FOUND THEN
      result := jsonb_build_object(
        'success', false,
        'error', 'Page already at top',
        'code', 'ALREADY_AT_TOP'
      );
      
      PERFORM public.log_page_operation(
        p_page_id, 'move_up', NULL, NULL, 'Page already at top'
      );
      
      RETURN result;
    END IF;
    
    -- Swap positions and increment versions
    temp_order := current_page.sort_order;
    
    UPDATE public.pages 
    SET sort_order = previous_page.sort_order, version = version + 1 
    WHERE id = current_page.id;
    
    UPDATE public.pages 
    SET sort_order = temp_order, version = version + 1 
    WHERE id = previous_page.id;
    
    -- Log successful operation
    PERFORM public.log_page_operation(
      p_page_id, 
      'move_up',
      jsonb_build_object('sort_order', current_page.sort_order),
      jsonb_build_object('sort_order', previous_page.sort_order)
    );
    
    result := jsonb_build_object(
      'success', true,
      'new_version', current_page.version + 1,
      'message', 'Page moved up successfully'
    );
    
    RETURN result;
    
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM public.log_page_operation(
        p_page_id, 'move_up', NULL, NULL, SQLERRM
      );
      
      result := jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'TRANSACTION_ERROR'
      );
      
      RETURN result;
  END;
END;
$$;