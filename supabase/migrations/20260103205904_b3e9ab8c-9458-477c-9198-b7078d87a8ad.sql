-- Create onboarding_owners table for owner configuration
CREATE TABLE public.onboarding_owners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS on onboarding_owners
ALTER TABLE public.onboarding_owners ENABLE ROW LEVEL SECURITY;

-- RLS policies for onboarding_owners
CREATE POLICY "Admins can manage onboarding owners"
ON public.onboarding_owners
FOR ALL
USING (get_current_user_role() = 'admin');

CREATE POLICY "Everyone can view onboarding owners"
ON public.onboarding_owners
FOR SELECT
USING (true);

-- Add owner_id column to onboarding_steps
ALTER TABLE public.onboarding_steps 
ADD COLUMN owner_id UUID REFERENCES public.onboarding_owners(id) ON DELETE SET NULL;

-- Drop the is_active dependent policy first
DROP POLICY IF EXISTS "Everyone can view active onboarding steps" ON public.onboarding_steps;

-- Drop the is_active column
ALTER TABLE public.onboarding_steps DROP COLUMN IF EXISTS is_active;

-- Create new SELECT policy for onboarding_steps (all steps visible)
CREATE POLICY "Everyone can view onboarding steps"
ON public.onboarding_steps
FOR SELECT
USING (true);

-- Create updated_at trigger for onboarding_owners
CREATE TRIGGER update_onboarding_owners_updated_at
BEFORE UPDATE ON public.onboarding_owners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();