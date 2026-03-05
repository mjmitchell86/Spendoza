-- Add report_type, from_date, to_date to email_jobs
ALTER TABLE email_jobs
  ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS from_date DATE,
  ADD COLUMN IF NOT EXISTS to_date DATE;

-- Add report_type to email_report_log
ALTER TABLE email_report_log
  ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'weekly';

-- Drop + recreate unique constraint on email_report_log to include report_type
ALTER TABLE email_report_log
  DROP CONSTRAINT IF EXISTS email_report_log_user_id_entity_type_entity_id_report_mon_key;

ALTER TABLE email_report_log
  ADD CONSTRAINT email_report_log_user_entity_month_type_key
    UNIQUE (user_id, entity_type, entity_id, report_month, report_type);

-- Trigger function for quarterly email jobs (routes to /api/emails/send-quarterly)
CREATE OR REPLACE FUNCTION notify_quarterly_email_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.report_type = 'quarterly' THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.api_url') || '/api/emails/send-quarterly',
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

DROP TRIGGER IF EXISTS trigger_quarterly_email_job ON email_jobs;
CREATE TRIGGER trigger_quarterly_email_job
  AFTER INSERT ON email_jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_quarterly_email_job();

-- pg_cron schedule: noon UTC on Jan/Apr/Jul/Oct 1st
SELECT cron.schedule(
  'dispatch-quarterly-reports',
  '0 12 1 1,4,7,10 *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.api_url') || '/api/emails/dispatch-quarterly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
