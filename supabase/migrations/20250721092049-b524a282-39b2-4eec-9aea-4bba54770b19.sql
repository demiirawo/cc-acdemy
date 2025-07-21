-- First, let's create the profile for the existing user Faizay
INSERT INTO public.profiles (user_id, display_name, email, role)
SELECT 
    au.id,
    COALESCE(au.raw_user_meta_data->>'display_name', au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
    au.email,
    'viewer'
FROM auth.users au
WHERE au.email = 'faizay.irawo@care-cuddle.co.uk'
AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = au.id
);

-- Now ensure the trigger function exists and is working
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'viewer'
  );
  RETURN NEW;
END;
$$;

-- Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();