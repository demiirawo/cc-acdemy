-- Create notification settings table for admin alert preferences
CREATE TABLE public.notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  send_time TIME NOT NULL DEFAULT '07:00:00',
  days_before INTEGER DEFAULT NULL, -- For advance warning alerts
  recipient_emails TEXT[] DEFAULT '{}', -- Additional recipients beyond admins
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(notification_type)
);

-- Insert default notification settings
INSERT INTO public.notification_settings (notification_type, is_enabled, send_time, days_before) VALUES
  ('birthday_today', true, '07:00:00', 0),
  ('anniversary_today', true, '07:00:00', 0),
  ('upcoming_holidays', true, '07:00:00', 7),
  ('pattern_expiring', true, '07:00:00', 14),
  ('holiday_no_client_notification', true, '07:00:00', 14);

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage notification settings
CREATE POLICY "Admins can manage notification settings"
ON public.notification_settings
FOR ALL
USING (get_current_user_role() = 'admin');

-- Create trigger for updated_at
CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();