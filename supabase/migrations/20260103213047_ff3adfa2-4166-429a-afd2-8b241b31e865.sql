-- Add stage column to onboarding_steps for grouping
ALTER TABLE public.onboarding_steps 
ADD COLUMN stage text NOT NULL DEFAULT 'Getting Started';

-- Update step_type to include acknowledgement
COMMENT ON COLUMN public.onboarding_steps.step_type IS 'task, internal_page, external_link, acknowledgement';