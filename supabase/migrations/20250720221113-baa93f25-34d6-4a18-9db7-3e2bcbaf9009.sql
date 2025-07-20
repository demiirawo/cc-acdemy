-- Security Fix Migration: Critical Vulnerabilities
-- 1. Fix privilege escalation in profiles table
DROP POLICY IF EXISTS "Users can update their own profile (except role)" ON public.profiles;

-- Create separate policies for profile updates vs role updates
CREATE POLICY "Users can update their own profile data" ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id 
  AND OLD.role = NEW.role -- Prevent role changes by regular users
);

CREATE POLICY "Admins can update any user role" ON public.profiles 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- 2. Fix database function security issues
-- Update all functions to use secure search path
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_has_page_permission(page_id uuid, permission_types text[])
RETURNS boolean 
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.page_permissions 
    WHERE page_permissions.page_id = $1 
    AND (
      (page_permissions.user_id = auth.uid()) OR
      (page_permissions.role IS NOT NULL AND page_permissions.role = ANY(public.get_user_roles(auth.uid())))
    )
    AND page_permissions.permission_type = ANY($2)
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Add server-side email domain validation
CREATE OR REPLACE FUNCTION public.validate_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only allow care-cuddle.co.uk domain for new signups
  IF NEW.email IS NOT NULL AND NEW.email NOT LIKE '%@care-cuddle.co.uk' THEN
    RAISE EXCEPTION 'Email domain not allowed. Please use a care-cuddle.co.uk email address.';
  END IF;
  RETURN NEW;
END;
$$;

-- Apply email domain validation trigger
DROP TRIGGER IF EXISTS validate_email_domain_trigger ON auth.users;
CREATE TRIGGER validate_email_domain_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_email_domain();

-- 4. Create audit log for security events
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  event_details jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on security audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view security audit logs
CREATE POLICY "Admins can view security audit logs" ON public.security_audit_log
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Allow system to insert audit logs
CREATE POLICY "Allow security audit log inserts" ON public.security_audit_log
FOR INSERT 
WITH CHECK (true);

-- 5. Function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_user_id uuid,
  p_event_type text,
  p_event_details jsonb DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    user_id, event_type, event_details, ip_address, user_agent
  ) VALUES (
    p_user_id, p_event_type, p_event_details, p_ip_address, p_user_agent
  );
END;
$$;