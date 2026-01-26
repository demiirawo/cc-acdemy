-- Recreate the daily-admin-alerts cron job with correct permissions
SELECT cron.schedule(
  'daily-admin-alerts',
  '0 7 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/daily-admin-alerts',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhdnd3Z2ZncHlrYWticWt4c2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTI0MTgsImV4cCI6MjA2ODI2ODQxOH0.P_bXEqMgMBY3gAb3XX-NXGkFeIhi6w8BFJBPx8Qx0mc"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);