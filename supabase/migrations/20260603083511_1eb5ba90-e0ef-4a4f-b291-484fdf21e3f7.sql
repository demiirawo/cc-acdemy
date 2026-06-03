
-- Admin-defined predefined handover task templates
CREATE TABLE public.handover_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  link text,
  sort_order integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.handover_task_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handover_task_templates TO authenticated;
GRANT ALL ON public.handover_task_templates TO service_role;

ALTER TABLE public.handover_task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view handover templates"
  ON public.handover_task_templates FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage handover templates"
  ON public.handover_task_templates FOR ALL
  USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

CREATE TRIGGER trg_handover_task_templates_updated
  BEFORE UPDATE ON public.handover_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-client handover tracker entries (filled in on public link)
CREATE TABLE public.client_handover_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  template_id uuid REFERENCES public.handover_task_templates(id) ON DELETE SET NULL,
  task_name text NOT NULL,
  task_description text,
  link text,
  handed_over_by text,
  handed_over_to text,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  target_date date,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_handover_tasks TO anon, authenticated;
GRANT ALL ON public.client_handover_tasks TO service_role;

ALTER TABLE public.client_handover_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view handover tasks"
  ON public.client_handover_tasks FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Public can insert handover tasks"
  ON public.client_handover_tasks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Public can update handover tasks"
  ON public.client_handover_tasks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete handover tasks"
  ON public.client_handover_tasks FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX idx_client_handover_tasks_client_name ON public.client_handover_tasks(client_name);

CREATE TRIGGER trg_client_handover_tasks_updated
  BEFORE UPDATE ON public.client_handover_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
