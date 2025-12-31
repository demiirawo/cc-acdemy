-- Create a staff_client_assignments table for many-to-many relationship
CREATE TABLE public.staff_client_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_user_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(staff_user_id, client_name)
);

-- Enable RLS
ALTER TABLE public.staff_client_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage staff client assignments"
ON public.staff_client_assignments
FOR ALL
USING (get_current_user_role() = 'admin');

CREATE POLICY "Users can view their own client assignments"
ON public.staff_client_assignments
FOR SELECT
USING (auth.uid() = staff_user_id);

-- Create updated_at trigger
CREATE TRIGGER update_staff_client_assignments_updated_at
BEFORE UPDATE ON public.staff_client_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();