-- Public read-only training matrix (shared via /public/training-matrix).
--
-- 1) Anonymous visitors may read ACTIVE training items (course names only).
DROP POLICY IF EXISTS "Anon can view active training items" ON public.training_items;
CREATE POLICY "Anon can view active training items"
ON public.training_items FOR SELECT TO anon
USING (is_active = true);

-- 2) Training records are exposed through a column-scoped, definer-rights view
--    (no notes, no created_by) instead of an anon policy on the base table, so
--    the notes column stays unreadable to anon. Supabase default privileges
--    grant ALL on new views, so explicitly reduce to SELECT-only: the view runs
--    with definer rights and would otherwise let anon WRITE through it,
--    bypassing the base table's RLS.
CREATE OR REPLACE VIEW public.training_records_public AS
  SELECT id, training_item_id, user_id, completed_date
  FROM public.training_records;

REVOKE ALL ON public.training_records_public FROM anon, authenticated;
GRANT SELECT ON public.training_records_public TO anon, authenticated;

-- 3) Staff columns for the matrix. hr_profiles_public is security_invoker=on,
--    so anon reads come back empty; expose only user_id + employment_status of
--    current staff via a definer-rights view (no salary/phone/notes columns).
CREATE OR REPLACE VIEW public.training_matrix_staff_public AS
  SELECT user_id, employment_status
  FROM public.hr_profiles
  WHERE employment_status IN ('onboarding_probation', 'onboarding_passed', 'active');

REVOKE ALL ON public.training_matrix_staff_public FROM anon, authenticated;
GRANT SELECT ON public.training_matrix_staff_public TO anon, authenticated;
