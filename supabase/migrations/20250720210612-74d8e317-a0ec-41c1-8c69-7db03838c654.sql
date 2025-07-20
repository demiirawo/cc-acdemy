-- Enable the pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable the pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the cleanup function to run every 5 minutes
SELECT cron.schedule(
  'cleanup-unconfirmed-users',
  '*/5 * * * *', -- every 5 minutes
  $$
  SELECT
    net.http_post(
        url:='https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/cleanup-unconfirmed-users',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhdnd3Z2ZncHlrYWticWt4c2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTI0MTgsImV4cCI6MjA2ODI2ODQxOH0.P_bXEqMgMBY3gAb3XX-NXGkFeIhi6w8BFJBPx8Qx0mc"}'::jsonb,
        body:='{"triggered_by": "cron"}'::jsonb
    ) as request_id;
  $$
);