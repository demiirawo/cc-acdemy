-- Add deleted_at column to pages table for soft delete
ALTER TABLE public.pages 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for faster queries on deleted pages
CREATE INDEX idx_pages_deleted_at ON public.pages(deleted_at) WHERE deleted_at IS NOT NULL;

-- Update existing RLS policies to exclude soft-deleted pages
-- Drop existing view policies and recreate with deleted_at filter
DROP POLICY IF EXISTS "Users can view public pages" ON public.pages;
DROP POLICY IF EXISTS "Users can view their own pages" ON public.pages;
DROP POLICY IF EXISTS "Users can view pages with read permission" ON public.pages;
DROP POLICY IF EXISTS "Admins can view all pages" ON public.pages;

-- Recreate view policies excluding soft-deleted pages
CREATE POLICY "Users can view public pages"
ON public.pages
FOR SELECT
USING (is_public = true AND deleted_at IS NULL);

CREATE POLICY "Users can view their own pages"
ON public.pages
FOR SELECT
USING (auth.uid() = created_by AND deleted_at IS NULL);

CREATE POLICY "Users can view pages with read permission"
ON public.pages
FOR SELECT
USING (user_has_page_permission(id, ARRAY['read', 'write', 'admin']) AND deleted_at IS NULL);

CREATE POLICY "Admins can view all pages"
ON public.pages
FOR SELECT
USING (get_current_user_role() = 'admin');

-- Add policy for viewing deleted pages (recycling bin)
CREATE POLICY "Users can view their own deleted pages"
ON public.pages
FOR SELECT
USING (auth.uid() = created_by AND deleted_at IS NOT NULL);

CREATE POLICY "Admins can view all deleted pages"
ON public.pages
FOR SELECT
USING (get_current_user_role() = 'admin' AND deleted_at IS NOT NULL);

-- Create function to restore deleted pages
CREATE OR REPLACE FUNCTION public.restore_page(p_page_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_page RECORD;
BEGIN
  -- Get the deleted page
  SELECT id, created_by, deleted_at
  INTO v_page
  FROM pages
  WHERE id = p_page_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page not found or not deleted'
    );
  END IF;

  -- Check if user has permission
  IF v_page.created_by != auth.uid() AND get_current_user_role() != 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient permissions'
    );
  END IF;

  -- Restore the page
  UPDATE pages
  SET deleted_at = NULL,
      updated_at = now()
  WHERE id = p_page_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Page restored successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;

-- Create function to permanently delete pages
CREATE OR REPLACE FUNCTION public.permanently_delete_page(p_page_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_page RECORD;
BEGIN
  -- Get the deleted page
  SELECT id, created_by, deleted_at
  INTO v_page
  FROM pages
  WHERE id = p_page_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Page not found or not in recycling bin'
    );
  END IF;

  -- Check if user has permission
  IF v_page.created_by != auth.uid() AND get_current_user_role() != 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient permissions'
    );
  END IF;

  -- Permanently delete the page
  DELETE FROM pages WHERE id = p_page_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Page permanently deleted'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;