-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view public pages" ON public.pages;
DROP POLICY IF EXISTS "Authenticated users can view pages they have permission for" ON public.pages;
DROP POLICY IF EXISTS "Users can update pages they have write permission for" ON public.pages;

-- Create security definer functions to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_has_page_permission(page_id UUID, permission_types TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.page_permissions 
    WHERE page_permissions.page_id = $1 
    AND page_permissions.user_id = auth.uid() 
    AND page_permissions.permission_type = ANY($2)
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create new safe policies for pages
CREATE POLICY "Users can view public pages" ON public.pages 
FOR SELECT USING (is_public = true);

CREATE POLICY "Users can view their own pages" ON public.pages 
FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Admins can view all pages" ON public.pages 
FOR SELECT USING (public.get_current_user_role() = 'admin');

CREATE POLICY "Users can view pages with read permission" ON public.pages 
FOR SELECT USING (public.user_has_page_permission(id, ARRAY['read', 'write', 'admin']));

CREATE POLICY "Users can update their own pages" ON public.pages 
FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Admins can update all pages" ON public.pages 
FOR UPDATE USING (public.get_current_user_role() = 'admin');

CREATE POLICY "Users can update pages with write permission" ON public.pages 
FOR UPDATE USING (public.user_has_page_permission(id, ARRAY['write', 'admin']));