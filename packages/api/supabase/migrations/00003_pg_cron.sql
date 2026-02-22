-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule monthly report generation
-- Fires on the 1st of every month at 2:00 AM UTC
-- Note: app.settings.api_base_url and app.settings.cron_secret must be
-- configured in Supabase project settings before this cron job will work.
SELECT cron.schedule(
  'monthly-report-generation',
  '0 2 1 * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.api_base_url') || '/api/reports/generate-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
  $$
);
