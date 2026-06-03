GRANT SELECT ON public.handover_task_templates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.handover_task_templates TO authenticated;
GRANT ALL ON public.handover_task_templates TO service_role;