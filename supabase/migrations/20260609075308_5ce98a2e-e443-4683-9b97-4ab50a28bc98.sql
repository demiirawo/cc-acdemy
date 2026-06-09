
CREATE TABLE public.client_handover_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.client_handover_tasks(id) ON DELETE CASCADE,
  author_user_id UUID,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_clarification_request BOOLEAN NOT NULL DEFAULT false,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_handover_task_comments TO authenticated;
GRANT ALL ON public.client_handover_task_comments TO service_role;

ALTER TABLE public.client_handover_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view handover task comments"
  ON public.client_handover_task_comments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can add handover task comments"
  ON public.client_handover_task_comments FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authors or admins can update handover task comments"
  ON public.client_handover_task_comments FOR UPDATE
  TO authenticated
  USING (author_user_id = auth.uid() OR public.get_current_user_role() = 'admin')
  WITH CHECK (author_user_id = auth.uid() OR public.get_current_user_role() = 'admin');

CREATE POLICY "Authors or admins can delete handover task comments"
  ON public.client_handover_task_comments FOR DELETE
  TO authenticated
  USING (author_user_id = auth.uid() OR public.get_current_user_role() = 'admin');

CREATE TRIGGER set_client_handover_task_comments_updated_at
  BEFORE UPDATE ON public.client_handover_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX client_handover_task_comments_task_idx
  ON public.client_handover_task_comments(task_id, created_at);
