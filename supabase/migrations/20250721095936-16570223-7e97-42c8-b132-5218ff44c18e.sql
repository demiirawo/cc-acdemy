
-- Remove the validate_email_domain trigger that's causing conflicts with frontend validation
DROP TRIGGER IF EXISTS validate_email_domain_trigger ON auth.users;

-- We can also drop the function since it's no longer needed
DROP FUNCTION IF EXISTS public.validate_email_domain();
