
-- Phase 1: Database & Backend Stability Foundation
-- Add optimistic locking and audit trail capabilities

-- Add version column for optimistic locking
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create audit trail table for page operations
CREATE TABLE IF NOT EXISTS public.page_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL,
  operation_type TEXT NOT NULL, -- 'move', 'create', 'update', 'delete'
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  error_message TEXT
);

-- Enable RLS on audit log
ALTER TABLE public.page_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy for audit log - admins can view all, users can view their own operations
CREATE POLICY "Users can view their own audit logs" ON public.page_audit_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all audit logs" ON public.page_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow inserting audit logs
CREATE POLICY "Allow audit log inserts" ON public.page_audit_log
  FOR INSERT WITH CHECK (true);

-- Create function to log page operations
CREATE OR REPLACE FUNCTION public.log_page_operation(
  p_page_id UUID,
  p_operation_type TEXT,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.page_audit_log (
    page_id, operation_type, old_values, new_values, user_id, error_message
  ) VALUES (
    p_page_id, p_operation_type, p_old_values, p_new_values, auth.uid(), p_error_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced move_page_up with transaction safety and optimistic locking
CREATE OR REPLACE FUNCTION public.move_page_up_safe(p_page_id UUID, p_expected_version INTEGER)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced move_page_down with transaction safety and optimistic locking
CREATE OR REPLACE FUNCTION public.move_page_down_safe(p_page_id UUID, p_expected_version INTEGER)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely move page to new parent with transaction safety
CREATE OR REPLACE FUNCTION public.move_page_to_parent_safe(
  p_page_id UUID, 
  p_new_parent_id UUID, 
  p_expected_version INTEGER
)
RETURNS JSONB AS $$
DECLARE
  current_page RECORD;
  result JSONB;
  new_sort_order INTEGER;
BEGIN
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
        p_page_id, 'move_parent', NULL, NULL, 'Page not found or version mismatch'
      );
      
      RETURN result;
    END IF;
    
    -- Prevent circular references
    IF p_new_parent_id IS NOT NULL THEN
      IF EXISTS (
        WITH RECURSIVE page_hierarchy AS (
          SELECT id, parent_page_id FROM public.pages WHERE id = p_page_id
          UNION ALL
          SELECT p.id, p.parent_page_id 
          FROM public.pages p
          INNER JOIN page_hierarchy ph ON p.parent_page_id = ph.id
        )
        SELECT 1 FROM page_hierarchy WHERE id = p_new_parent_id
      ) THEN
        result := jsonb_build_object(
          'success', false,
          'error', 'Cannot move page under its own child',
          'code', 'CIRCULAR_REFERENCE'
        );
        
        PERFORM public.log_page_operation(
          p_page_id, 'move_parent', NULL, NULL, 'Circular reference detected'
        );
        
        RETURN result;
      END IF;
    END IF;
    
    -- Get next sort order for new location
    new_sort_order := public.get_next_sort_order(p_new_parent_id, current_page.space_id);
    
    -- Update page location
    UPDATE public.pages 
    SET 
      parent_page_id = p_new_parent_id,
      sort_order = new_sort_order,
      version = version + 1
    WHERE id = p_page_id;
    
    -- Log successful operation
    PERFORM public.log_page_operation(
      p_page_id, 
      'move_parent',
      jsonb_build_object(
        'parent_page_id', current_page.parent_page_id,
        'sort_order', current_page.sort_order
      ),
      jsonb_build_object(
        'parent_page_id', p_new_parent_id,
        'sort_order', new_sort_order
      )
    );
    
    result := jsonb_build_object(
      'success', true,
      'new_version', current_page.version + 1,
      'message', 'Page moved to new parent successfully'
    );
    
    RETURN result;
    
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM public.log_page_operation(
        p_page_id, 'move_parent', NULL, NULL, SQLERRM
      );
      
      result := jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'code', 'TRANSACTION_ERROR'
      );
      
      RETURN result;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger to increment version on any page update
CREATE OR REPLACE FUNCTION public.increment_page_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for version increment
DROP TRIGGER IF EXISTS page_version_trigger ON public.pages;
CREATE TRIGGER page_version_trigger
  BEFORE UPDATE ON public.pages
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_page_version();
