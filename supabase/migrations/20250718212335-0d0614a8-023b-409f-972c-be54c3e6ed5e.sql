-- Step 1: Data cleanup - Fix duplicate sort orders and normalize gaps
DO $$
DECLARE
    parent_record RECORD;
    page_record RECORD;
    new_sort_order INTEGER;
BEGIN
    -- Fix pages with duplicate sort orders by group (parent_page_id, space_id)
    FOR parent_record IN (
        SELECT DISTINCT 
            COALESCE(parent_page_id::text, 'NULL') as parent_key,
            COALESCE(space_id::text, 'NULL') as space_key,
            parent_page_id,
            space_id
        FROM pages 
        ORDER BY parent_key, space_key
    ) LOOP
        new_sort_order := 1000;
        
        -- Update each page in this group with proper sequential sort order
        FOR page_record IN (
            SELECT id FROM pages 
            WHERE (parent_page_id = parent_record.parent_page_id OR (parent_page_id IS NULL AND parent_record.parent_page_id IS NULL))
            AND (space_id = parent_record.space_id OR (space_id IS NULL AND parent_record.space_id IS NULL))
            ORDER BY sort_order ASC, created_at ASC
        ) LOOP
            UPDATE pages 
            SET sort_order = new_sort_order 
            WHERE id = page_record.id;
            
            new_sort_order := new_sort_order + 1000;
        END LOOP;
    END LOOP;
    
    RAISE LOG 'Data cleanup completed - normalized sort orders';
END $$;

-- Step 2: Enhanced move functions with better error handling and validation
CREATE OR REPLACE FUNCTION public.move_page_up_enhanced(p_page_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_page RECORD;
  previous_page RECORD;
  temp_order INTEGER;
  result JSONB;
  retry_count INTEGER := 0;
  max_retries INTEGER := 3;
BEGIN
  -- Retry loop for version conflicts
  WHILE retry_count < max_retries LOOP
    BEGIN
      -- Get current page with optimistic lock
      SELECT * INTO current_page 
      FROM public.pages 
      WHERE id = p_page_id 
      FOR UPDATE;
      
      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Page not found',
          'code', 'PAGE_NOT_FOUND'
        );
      END IF;
      
      -- Check version if provided (allow version mismatch on first attempt for auto-retry)
      IF p_expected_version > 0 AND current_page.version != p_expected_version AND retry_count = 0 THEN
        -- Auto-retry with current version
        retry_count := retry_count + 1;
        p_expected_version := current_page.version;
        CONTINUE;
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
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Page already at top',
          'code', 'ALREADY_AT_TOP'
        );
      END IF;
      
      -- Swap positions and increment versions
      temp_order := current_page.sort_order;
      
      UPDATE public.pages 
      SET sort_order = previous_page.sort_order, version = version + 1, updated_at = now()
      WHERE id = current_page.id;
      
      UPDATE public.pages 
      SET sort_order = temp_order, version = version + 1, updated_at = now()
      WHERE id = previous_page.id;
      
      -- Log successful operation
      PERFORM public.log_page_operation(
        p_page_id, 
        'move_up_enhanced',
        jsonb_build_object('sort_order', current_page.sort_order, 'version', current_page.version),
        jsonb_build_object('sort_order', previous_page.sort_order, 'version', current_page.version + 1)
      );
      
      RETURN jsonb_build_object(
        'success', true,
        'new_version', current_page.version + 1,
        'message', 'Page moved up successfully',
        'retry_count', retry_count
      );
      
    EXCEPTION
      WHEN serialization_failure OR deadlock_detected THEN
        retry_count := retry_count + 1;
        IF retry_count >= max_retries THEN
          PERFORM public.log_page_operation(
            p_page_id, 'move_up_enhanced', NULL, NULL, 'Max retries exceeded: ' || SQLERRM
          );
          
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Database conflict - please try again',
            'code', 'RETRY_EXCEEDED'
          );
        END IF;
        
        -- Wait briefly before retry
        PERFORM pg_sleep(0.1 * retry_count);
        
      WHEN OTHERS THEN
        PERFORM public.log_page_operation(
          p_page_id, 'move_up_enhanced', NULL, NULL, SQLERRM
        );
        
        RETURN jsonb_build_object(
          'success', false,
          'error', SQLERRM,
          'code', 'TRANSACTION_ERROR'
        );
    END;
  END LOOP;
  
  -- Should never reach here
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Unexpected retry loop exit',
    'code', 'INTERNAL_ERROR'
  );
END;
$function$;

-- Step 3: Enhanced move down function
CREATE OR REPLACE FUNCTION public.move_page_down_enhanced(p_page_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_page RECORD;
  next_page RECORD;
  temp_order INTEGER;
  result JSONB;
  retry_count INTEGER := 0;
  max_retries INTEGER := 3;
BEGIN
  -- Retry loop for version conflicts
  WHILE retry_count < max_retries LOOP
    BEGIN
      -- Get current page with optimistic lock
      SELECT * INTO current_page 
      FROM public.pages 
      WHERE id = p_page_id 
      FOR UPDATE;
      
      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Page not found',
          'code', 'PAGE_NOT_FOUND'
        );
      END IF;
      
      -- Check version if provided (allow version mismatch on first attempt for auto-retry)
      IF p_expected_version > 0 AND current_page.version != p_expected_version AND retry_count = 0 THEN
        -- Auto-retry with current version
        retry_count := retry_count + 1;
        p_expected_version := current_page.version;
        CONTINUE;
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
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Page already at bottom',
          'code', 'ALREADY_AT_BOTTOM'
        );
      END IF;
      
      -- Swap positions and increment versions
      temp_order := current_page.sort_order;
      
      UPDATE public.pages 
      SET sort_order = next_page.sort_order, version = version + 1, updated_at = now()
      WHERE id = current_page.id;
      
      UPDATE public.pages 
      SET sort_order = temp_order, version = version + 1, updated_at = now()
      WHERE id = next_page.id;
      
      -- Log successful operation
      PERFORM public.log_page_operation(
        p_page_id, 
        'move_down_enhanced',
        jsonb_build_object('sort_order', current_page.sort_order, 'version', current_page.version),
        jsonb_build_object('sort_order', next_page.sort_order, 'version', current_page.version + 1)
      );
      
      RETURN jsonb_build_object(
        'success', true,
        'new_version', current_page.version + 1,
        'message', 'Page moved down successfully',
        'retry_count', retry_count
      );
      
    EXCEPTION
      WHEN serialization_failure OR deadlock_detected THEN
        retry_count := retry_count + 1;
        IF retry_count >= max_retries THEN
          PERFORM public.log_page_operation(
            p_page_id, 'move_down_enhanced', NULL, NULL, 'Max retries exceeded: ' || SQLERRM
          );
          
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Database conflict - please try again',
            'code', 'RETRY_EXCEEDED'
          );
        END IF;
        
        -- Wait briefly before retry
        PERFORM pg_sleep(0.1 * retry_count);
        
      WHEN OTHERS THEN
        PERFORM public.log_page_operation(
          p_page_id, 'move_down_enhanced', NULL, NULL, SQLERRM
        );
        
        RETURN jsonb_build_object(
          'success', false,
          'error', SQLERRM,
          'code', 'TRANSACTION_ERROR'
        );
    END;
  END LOOP;
  
  -- Should never reach here
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Unexpected retry loop exit',
    'code', 'INTERNAL_ERROR'
  );
END;
$function$;