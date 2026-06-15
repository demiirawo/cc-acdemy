-- Onboarding automation: configurable offer email + auto contract, kickoff tracking.

CREATE TABLE IF NOT EXISTS public.onboarding_settings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_email_enabled  boolean NOT NULL DEFAULT true,
  offer_email_subject  text NOT NULL DEFAULT 'Welcome to Care Cuddle — Your Offer',
  offer_email_body_html text NOT NULL DEFAULT '<p>Dear team member,</p><p>We are delighted to offer you a position at Care Cuddle. Please review your employment contract and complete your onboarding steps in the Academy.</p><p>Welcome aboard!</p>',
  contract_enabled     boolean NOT NULL DEFAULT true,
  contract_template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.onboarding_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage onboarding settings" ON public.onboarding_settings;
CREATE POLICY "Admins manage onboarding settings"
  ON public.onboarding_settings FOR ALL
  TO authenticated
  USING (public.get_current_user_role() = 'admin')
  WITH CHECK (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Authenticated read onboarding settings" ON public.onboarding_settings;
CREATE POLICY "Authenticated read onboarding settings"
  ON public.onboarding_settings FOR SELECT
  TO authenticated
  USING (true);

-- Seed a single settings row.
INSERT INTO public.onboarding_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_settings);

DROP TRIGGER IF EXISTS onboarding_settings_set_updated_at ON public.onboarding_settings;
CREATE TRIGGER onboarding_settings_set_updated_at
  BEFORE UPDATE ON public.onboarding_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Kickoff tracking on hr_profiles.
ALTER TABLE public.hr_profiles
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;
