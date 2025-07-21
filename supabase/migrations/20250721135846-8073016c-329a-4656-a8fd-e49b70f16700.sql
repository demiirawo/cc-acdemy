-- Remove the temporary password functionality tables and columns
DROP TABLE IF EXISTS public.temporary_passwords;

-- Remove the requires_password_reset column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS requires_password_reset;

-- Drop the functions we created for temporary passwords
DROP FUNCTION IF EXISTS public.generate_temporary_password(text);
DROP FUNCTION IF EXISTS public.is_temporary_password(uuid, text);