-- Fix Role Escalation Vulnerability
-- Remove the ability for users to update their own role

-- Drop the existing problematic policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create a secure policy that excludes role updates
CREATE POLICY "Users can update their own profile (except role)" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND 
  -- Prevent role updates by ensuring role doesn't change
  (OLD.role IS NOT DISTINCT FROM NEW.role)
);

-- Create admin-only policy for role management
CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Fix Database Function Security Issues
-- Update all functions to use secure search_path

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.user_has_page_permission(page_id uuid, permission_types text[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.page_permissions 
    WHERE page_permissions.page_id = $1 
    AND (
      (page_permissions.user_id = auth.uid()) OR
      (page_permissions.role IS NOT NULL AND page_permissions.role = ANY(public.get_user_roles(auth.uid())))
    )
    AND page_permissions.permission_type = ANY($2)
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS app_role[] AS $$
  SELECT ARRAY_AGG(role) 
  FROM public.user_roles 
  WHERE user_id = _user_id
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

-- Add input validation constraints
ALTER TABLE public.pages 
ADD CONSTRAINT check_title_length CHECK (char_length(title) <= 255);

ALTER TABLE public.pages 
ADD CONSTRAINT check_content_length CHECK (char_length(content) <= 52428800); -- 50MB

-- Add URL validation for recommended reading
CREATE OR REPLACE FUNCTION public.validate_recommended_reading(data jsonb)
RETURNS BOOLEAN AS $$
DECLARE
  item jsonb;
BEGIN
  -- Check if data is an array
  IF jsonb_typeof(data) != 'array' THEN
    RETURN FALSE;
  END IF;
  
  -- Validate each item in the array
  FOR item IN SELECT jsonb_array_elements(data)
  LOOP
    -- Check required fields
    IF NOT (item ? 'title' AND item ? 'url' AND item ? 'type') THEN
      RETURN FALSE;
    END IF;
    
    -- Validate URL format (basic check)
    IF NOT (item->>'url' ~ '^https?://[^\s/$.?#].[^\s]*$') THEN
      RETURN FALSE;
    END IF;
    
    -- Validate type
    IF NOT (item->>'type' IN ('link', 'document', 'video', 'article')) THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Add constraint for recommended reading validation
ALTER TABLE public.pages 
ADD CONSTRAINT check_recommended_reading_valid 
CHECK (recommended_reading IS NULL OR public.validate_recommended_reading(recommended_reading));