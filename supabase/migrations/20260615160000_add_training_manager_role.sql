-- Allow the new 'training_manager' application role.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'editor'::text, 'viewer'::text, 'training_manager'::text]));

-- Training items: admins OR training managers may manage; everyone signed in can read.
DROP POLICY IF EXISTS "Admins manage training items" ON public.training_items;
CREATE POLICY "Admins manage training items"
  ON public.training_items FOR ALL
  TO authenticated
  USING (public.get_current_user_role() IN ('admin', 'training_manager'))
  WITH CHECK (public.get_current_user_role() IN ('admin', 'training_manager'));

-- Training records: admins OR training managers may manage every record.
DROP POLICY IF EXISTS "Admins manage training records" ON public.training_records;
CREATE POLICY "Admins manage training records"
  ON public.training_records FOR ALL
  TO authenticated
  USING (public.get_current_user_role() IN ('admin', 'training_manager'))
  WITH CHECK (public.get_current_user_role() IN ('admin', 'training_manager'));
