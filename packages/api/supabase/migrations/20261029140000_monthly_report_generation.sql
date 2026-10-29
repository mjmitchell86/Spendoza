-- Generate every user's and household's report for the previous month at
-- 09:00 UTC on the 1st, so the app's monthly check-up is ready that morning.
-- Uses the same Vault secrets as the weekly email job.

-- Re-running this migration must not leave two jobs behind.
SELECT cron.unschedule('monthly-report-generation')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-report-generation');

SELECT cron.schedule(
  'monthly-report-generation',
  '0 9 1 * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'api_base_url') || '/api/reports/generate-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    -- The endpoint answers only after every report is generated (up to the
    -- function's 300 s limit); pg_net's 5 s default would record a timeout.
    timeout_milliseconds := 300000
  );
  $$
);
