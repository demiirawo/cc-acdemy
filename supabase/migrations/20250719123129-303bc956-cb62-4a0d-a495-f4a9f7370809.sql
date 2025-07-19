
-- Update the pages table to support category field in recommended_reading JSONB
-- Since it's already JSONB, we just need to ensure the application handles the new category field
-- No database schema changes needed as JSONB is flexible

-- Let's add a comment to document the expected structure
COMMENT ON COLUMN public.pages.recommended_reading IS 'JSONB array containing recommended reading items with fields: title, description, type, url, fileUrl, fileName, category';
