
SELECT cron.unschedule('process-pending-rejections-every-15-min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-pending-rejections-every-15-min');

SELECT cron.unschedule('process-pending-rejections-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-pending-rejections-daily');

SELECT cron.schedule(
  'process-pending-rejections-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/process-pending-rejections',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhdnd3Z2ZncHlrYWticWt4c2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTI0MTgsImV4cCI6MjA2ODI2ODQxOH0.P_bXEqMgMBY3gAb3XX-NXGkFeIhi6w8BFJBPx8Qx0mc"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
