-- Per-staff target completion date for the training matrix. Lives in its own
-- table (not hr_profiles) so training managers can set it: hr_profiles is
-- admin-write-only, while this mirrors training_records' write policy.
CREATE TABLE IF NOT EXISTS public.training_targets (
  user_id uuid PRIMARY KEY,
  target_date date NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage training targets" ON public.training_targets;
CREATE POLICY "Admins manage training targets"
ON public.training_targets FOR ALL TO authenticated
USING (get_current_user_role() = ANY (ARRAY['admin'::text, 'training_manager'::text]))
WITH CHECK (get_current_user_role() = ANY (ARRAY['admin'::text, 'training_manager'::text]));

DROP POLICY IF EXISTS "Staff read own training target" ON public.training_targets;
CREATE POLICY "Staff read own training target"
ON public.training_targets FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- The public read-only matrix shows the target row too (a date is no more
-- sensitive than the completion dates already shown there).
DROP POLICY IF EXISTS "Anon can view training targets" ON public.training_targets;
CREATE POLICY "Anon can view training targets"
ON public.training_targets FOR SELECT TO anon
USING (true);
