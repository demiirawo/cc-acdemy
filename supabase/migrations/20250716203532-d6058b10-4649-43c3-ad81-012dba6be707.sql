-- Update the specific user to be super admin
UPDATE public.profiles 
SET role = 'admin' 
WHERE email = 'demi.irawo@care-cuddle.co.uk';

-- Make pages public by default and add public sharing features
ALTER TABLE public.pages 
ALTER COLUMN is_public SET DEFAULT true;

-- Update existing pages to be public by default
UPDATE public.pages 
SET is_public = true 
WHERE is_public IS NULL OR is_public = false;