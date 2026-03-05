-- Trigger function for annual email jobs (routes to /api/emails/send-annual)
CREATE OR REPLACE FUNCTION notify_annual_email_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.report_type = 'annual' THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.api_url') || '/api/emails/send-annual',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
      ),
      body := jsonb_build_object('job_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_annual_email_job ON email_jobs;
CREATE TRIGGER trigger_annual_email_job
  AFTER INSERT ON email_jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_annual_email_job();

-- pg_cron: hourly on Dec 31 UTC (catches UTC+14 through UTC+1)
SELECT cron.schedule(
  'dispatch-annual-reports-dec31',
  '0 * 31 12 *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.api_url') || '/api/emails/dispatch-annual',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- pg_cron: hourly on Jan 1 UTC (catches UTC+0 through UTC-12)
SELECT cron.schedule(
  'dispatch-annual-reports-jan1',
  '0 * 1 1 *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.api_url') || '/api/emails/dispatch-annual',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
