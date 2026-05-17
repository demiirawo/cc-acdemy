
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.pending_rejection_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL,
  candidate_name TEXT NOT NULL,
  email TEXT NOT NULL,
  send_after TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_rejection_emails_pending
  ON public.pending_rejection_emails (send_after)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pending_rejection_emails_attempt
  ON public.pending_rejection_emails (attempt_id);

ALTER TABLE public.pending_rejection_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view pending rejection emails"
  ON public.pending_rejection_emails FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can manage pending rejection emails"
  ON public.pending_rejection_emails FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'));
