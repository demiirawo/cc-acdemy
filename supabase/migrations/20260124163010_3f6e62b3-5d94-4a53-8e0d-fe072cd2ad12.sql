-- Create shift audit log table to track all changes
CREATE TABLE public.shift_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by UUID REFERENCES auth.users(id),
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shift_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can view shift audit logs"
  ON public.shift_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Add the new notification type
INSERT INTO public.notification_settings (notification_type, is_enabled, send_time, days_before, recipient_emails)
VALUES ('shift_change', true, '07:00:00', NULL, ARRAY[]::TEXT[])
ON CONFLICT (notification_type) DO NOTHING;

-- Create function to log shift changes
CREATE OR REPLACE FUNCTION public.log_shift_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO shift_audit_log (table_name, record_id, action, changed_by, new_data)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO shift_audit_log (table_name, record_id, action, changed_by, old_data, new_data)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO shift_audit_log (table_name, record_id, action, changed_by, old_data)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach triggers to staff_schedules
CREATE TRIGGER audit_staff_schedules
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_schedules
  FOR EACH ROW EXECUTE FUNCTION public.log_shift_change();

-- Attach triggers to recurring_shift_patterns
CREATE TRIGGER audit_recurring_shift_patterns
  AFTER INSERT OR UPDATE OR DELETE ON public.recurring_shift_patterns
  FOR EACH ROW EXECUTE FUNCTION public.log_shift_change();