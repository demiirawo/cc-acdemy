-- Check if the handle_new_user function exists and is working correctly
-- Let's create profiles for users who exist in auth but not in profiles

-- First, let's create a function to sync missing profiles
CREATE OR REPLACE FUNCTION sync_missing_profiles()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_profile BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create profiles for auth users who don't have them
  INSERT INTO public.profiles (user_id, display_name, email, role)
  SELECT 
    au.id,
    COALESCE(
      au.raw_user_meta_data->>'display_name', 
      au.raw_user_meta_data->>'full_name', 
      split_part(au.email, '@', 1)
    ),
    au.email,
    'viewer'
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.user_id
  WHERE p.user_id IS NULL
  AND au.email IS NOT NULL;

  -- Return info about what was created
  RETURN QUERY
  SELECT 
    au.id,
    au.email,
    (p.user_id IS NOT NULL) as created_profile
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.user_id
  WHERE au.email IS NOT NULL
  ORDER BY au.created_at DESC;
END;
$$;

-- Execute the sync function
SELECT * FROM sync_missing_profiles();