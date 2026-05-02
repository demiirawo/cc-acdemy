
-- Add notification settings row for staff shift change emails
INSERT INTO public.notification_settings (notification_type, is_enabled, send_time, recipient_emails)
VALUES ('staff_shift_change', true, '09:00:00', '{}')
ON CONFLICT DO NOTHING;

-- Schedule edge function to run every 5 minutes to email staff about their shift changes
SELECT cron.schedule(
  'staff-shift-change-notification',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/staff-shift-change-notification',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhdnd3Z2ZncHlrYWticWt4c2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTI0MTgsImV4cCI6MjA2ODI2ODQxOH0.P_bXEqMgMBY3gAb3XX-NXGkFeIhi6w8BFJBPx8Qx0mc"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
