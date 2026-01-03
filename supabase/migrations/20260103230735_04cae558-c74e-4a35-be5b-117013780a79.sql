-- Add variations column to glossary table for storing alternate terms
ALTER TABLE public.glossary
ADD COLUMN variations text[] NOT NULL DEFAULT '{}'::text[];