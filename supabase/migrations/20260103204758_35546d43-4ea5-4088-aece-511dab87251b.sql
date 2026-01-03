-- Create onboarding_steps table for admin-configurable steps
CREATE TABLE public.onboarding_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  step_type TEXT NOT NULL DEFAULT 'task', -- 'internal_page', 'external_link', 'task'
  target_page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  external_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create onboarding_completions table to track user progress
CREATE TABLE public.onboarding_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id UUID NOT NULL REFERENCES public.onboarding_steps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(step_id, user_id)
);

-- Create page_acknowledgements table to track page reads
CREATE TABLE public.page_acknowledgements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(page_id, user_id)
);

-- Enable RLS on all tables
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_acknowledgements ENABLE ROW LEVEL SECURITY;

-- RLS policies for onboarding_steps
CREATE POLICY "Admins can manage onboarding steps"
ON public.onboarding_steps
FOR ALL
USING (get_current_user_role() = 'admin');

CREATE POLICY "Everyone can view active onboarding steps"
ON public.onboarding_steps
FOR SELECT
USING (is_active = true);

-- RLS policies for onboarding_completions
CREATE POLICY "Admins can view all completions"
ON public.onboarding_completions
FOR SELECT
USING (get_current_user_role() = 'admin');

CREATE POLICY "Users can view their own completions"
ON public.onboarding_completions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can mark their own steps complete"
ON public.onboarding_completions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own completions"
ON public.onboarding_completions
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all completions"
ON public.onboarding_completions
FOR ALL
USING (get_current_user_role() = 'admin');

-- RLS policies for page_acknowledgements
CREATE POLICY "Users can acknowledge pages"
ON public.page_acknowledgements
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own acknowledgements"
ON public.page_acknowledgements
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all acknowledgements"
ON public.page_acknowledgements
FOR SELECT
USING (get_current_user_role() = 'admin');

-- Add updated_at trigger for onboarding_steps
CREATE TRIGGER update_onboarding_steps_updated_at
BEFORE UPDATE ON public.onboarding_steps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();