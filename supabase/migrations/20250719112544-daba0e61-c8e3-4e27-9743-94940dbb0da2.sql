-- Add missing columns to pages table if they don't exist
DO $$ 
BEGIN
    -- Add sort_order column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pages' AND column_name = 'sort_order') THEN
        ALTER TABLE public.pages ADD COLUMN sort_order INTEGER DEFAULT 1000;
        
        -- Create index for better performance
        CREATE INDEX IF NOT EXISTS idx_pages_sort_order ON public.pages(sort_order);
        
        -- Update existing pages with incremental sort orders
        WITH ranked_pages AS (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY COALESCE(parent_page_id::text, 'null'), COALESCE(space_id::text, 'null') 
                ORDER BY created_at
            ) * 1000 as new_sort_order
            FROM public.pages
            WHERE sort_order IS NULL
        )
        UPDATE public.pages 
        SET sort_order = ranked_pages.new_sort_order
        FROM ranked_pages 
        WHERE pages.id = ranked_pages.id;
    END IF;
    
    -- Add version column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pages' AND column_name = 'version') THEN
        ALTER TABLE public.pages ADD COLUMN version INTEGER DEFAULT 1;
        
        -- Create index for version tracking
        CREATE INDEX IF NOT EXISTS idx_pages_version ON public.pages(version);
    END IF;
END $$;