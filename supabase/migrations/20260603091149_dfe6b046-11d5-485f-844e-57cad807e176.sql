ALTER TABLE public.client_handover_tasks ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.handover_task_templates ADD COLUMN IF NOT EXISTS category text;