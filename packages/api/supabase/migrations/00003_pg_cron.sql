-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule monthly report generation
-- Fires on the 1st of every month at 2:00 AM UTC
-- Note: vault secrets 'api_base_url' and 'cron_secret' must be configured
-- in Supabase vault before this cron job will work.
SELECT cron.schedule(
  'monthly-report-generation',
  '0 2 1 * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'api_base_url') || '/api/reports/generate-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
  $$
);
