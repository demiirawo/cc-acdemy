-- =========================================================================
-- Training matrix: configurable training items + per-staff completion records
-- =========================================================================

-- ---------- training_items (configured in Settings → Configuration) ----------
CREATE TABLE IF NOT EXISTS public.training_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  -- How often the training must be refreshed, in months. NULL = never expires.
  refresh_frequency_months integer,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_items ENABLE ROW LEVEL SECURITY;

-- Admins manage the catalogue of training items.
DROP POLICY IF EXISTS "Admins manage training items" ON public.training_items;
CREATE POLICY "Admins manage training items"
  ON public.training_items FOR ALL
  TO authenticated
  USING (public.get_current_user_role() = 'admin')
  WITH CHECK (public.get_current_user_role() = 'admin');

-- Any signed-in user may read the active catalogue (e.g. to view their own record).
DROP POLICY IF EXISTS "Authenticated read training items" ON public.training_items;
CREATE POLICY "Authenticated read training items"
  ON public.training_items FOR SELECT
  TO authenticated
  USING (true);

-- ---------- training_records (one current record per staff member + item) ----------
CREATE TABLE IF NOT EXISTS public.training_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_item_id uuid NOT NULL REFERENCES public.training_items(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_date   date NOT NULL,
  notes            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (training_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS training_records_user_idx ON public.training_records(user_id);
CREATE INDEX IF NOT EXISTS training_records_item_idx ON public.training_records(training_item_id);

ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;

-- Admins manage every training record.
DROP POLICY IF EXISTS "Admins manage training records" ON public.training_records;
CREATE POLICY "Admins manage training records"
  ON public.training_records FOR ALL
  TO authenticated
  USING (public.get_current_user_role() = 'admin')
  WITH CHECK (public.get_current_user_role() = 'admin');

-- Staff may read their own training records.
DROP POLICY IF EXISTS "Staff read own training records" ON public.training_records;
CREATE POLICY "Staff read own training records"
  ON public.training_records FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------- keep updated_at fresh (reuse the shared trigger fn) ----------
DROP TRIGGER IF EXISTS training_items_set_updated_at ON public.training_items;
CREATE TRIGGER training_items_set_updated_at
  BEFORE UPDATE ON public.training_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS training_records_set_updated_at ON public.training_records;
CREATE TRIGGER training_records_set_updated_at
  BEFORE UPDATE ON public.training_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
