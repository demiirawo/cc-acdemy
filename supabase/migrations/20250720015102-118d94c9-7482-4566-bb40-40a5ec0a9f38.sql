
-- Enhanced audit logging for recommended reading changes
CREATE TABLE public.recommended_reading_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL,
  user_id UUID,
  operation_type TEXT NOT NULL, -- 'add', 'edit', 'delete', 'reorder', 'bulk_update'
  old_data JSONB,
  new_data JSONB,
  change_details JSONB, -- metadata about the change
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Content snapshots for recovery
CREATE TABLE public.page_content_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'auto', -- 'auto', 'manual', 'pre_save'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  recommended_reading JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS policies for audit table
ALTER TABLE public.recommended_reading_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs for pages they can access"
  ON public.recommended_reading_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pages 
      WHERE pages.id = recommended_reading_audit.page_id 
      AND (pages.created_by = auth.uid() OR pages.is_public = true)
    )
  );

CREATE POLICY "Allow audit log inserts"
  ON public.recommended_reading_audit
  FOR INSERT
  WITH CHECK (true);

-- RLS policies for snapshots table
ALTER TABLE public.page_content_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view snapshots for pages they can access"
  ON public.page_content_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pages 
      WHERE pages.id = page_content_snapshots.page_id 
      AND (pages.created_by = auth.uid() OR pages.is_public = true)
    )
  );

CREATE POLICY "Allow snapshot inserts"
  ON public.page_content_snapshots
  FOR INSERT
  WITH CHECK (true);

-- Function to create automatic snapshots
CREATE OR REPLACE FUNCTION public.create_page_snapshot(
  p_page_id UUID,
  p_snapshot_type TEXT DEFAULT 'auto'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  snapshot_id UUID;
  page_data RECORD;
BEGIN
  -- Get current page data
  SELECT title, content, recommended_reading INTO page_data
  FROM public.pages
  WHERE id = p_page_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Page not found: %', p_page_id;
  END IF;
  
  -- Create snapshot
  INSERT INTO public.page_content_snapshots (
    page_id, snapshot_type, title, content, recommended_reading, user_id
  ) VALUES (
    p_page_id, p_snapshot_type, page_data.title, page_data.content, 
    COALESCE(page_data.recommended_reading, '[]'::jsonb), auth.uid()
  ) RETURNING id INTO snapshot_id;
  
  -- Clean up old auto snapshots (keep last 10)
  IF p_snapshot_type = 'auto' THEN
    DELETE FROM public.page_content_snapshots
    WHERE page_id = p_page_id 
    AND snapshot_type = 'auto'
    AND id NOT IN (
      SELECT id FROM public.page_content_snapshots
      WHERE page_id = p_page_id AND snapshot_type = 'auto'
      ORDER BY created_at DESC
      LIMIT 10
    );
  END IF;
  
  RETURN snapshot_id;
END;
$$;

-- Function to log recommended reading changes
CREATE OR REPLACE FUNCTION public.log_recommended_reading_change(
  p_page_id UUID,
  p_operation_type TEXT,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_change_details JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.recommended_reading_audit (
    page_id, user_id, operation_type, old_data, new_data, change_details
  ) VALUES (
    p_page_id, auth.uid(), p_operation_type, p_old_data, p_new_data, p_change_details
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;
