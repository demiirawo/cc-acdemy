-- Add recommended_reading column to pages table to store recommended reading items
ALTER TABLE public.pages 
ADD COLUMN recommended_reading JSONB DEFAULT '[]'::jsonb;