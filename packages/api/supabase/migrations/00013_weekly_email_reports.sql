-- Add timezone and email preference to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS email_reports_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_report_day TEXT NOT NULL DEFAULT 'saturday',
  ADD COLUMN IF NOT EXISTS email_report_hour INTEGER NOT NULL DEFAULT 9
    CHECK (email_report_hour >= 0 AND email_report_hour <= 23);

-- Email job queue (dispatcher inserts, pg_net trigger fires worker)
CREATE TABLE email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  report_month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_email_jobs_status ON email_jobs(status) WHERE status = 'pending';

-- Email send log (tracks what was sent, prevents duplicates)
CREATE TABLE email_report_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  report_month DATE NOT NULL,
  email_subject TEXT,
  email_preview TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_type, entity_id, report_month)
);

CREATE INDEX idx_email_report_log_user ON email_report_log(user_id);

-- pg_net trigger: dispatch worker for each new email job
CREATE OR REPLACE FUNCTION dispatch_email_job()
RETURNS TRIGGER AS $$
DECLARE
  _api_base_url TEXT;
  _cron_secret TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT decrypted_secret INTO _api_base_url
    FROM vault.decrypted_secrets WHERE name = 'api_base_url';

    SELECT decrypted_secret INTO _cron_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_secret';

    PERFORM net.http_post(
      url := _api_base_url || '/api/emails/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _cron_secret
      ),
      body := jsonb_build_object('job_id', NEW.id::text)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_dispatch_email_job
  AFTER INSERT ON email_jobs
  FOR EACH ROW
  EXECUTE FUNCTION dispatch_email_job();

-- Hourly cron job to dispatch weekly emails
SELECT cron.schedule(
  'weekly-email-dispatch',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.api_base_url') || '/api/emails/dispatch-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- RLS policies for email tables
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_report_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access these tables (no client access needed)
CREATE POLICY "Service role only" ON email_jobs FOR ALL USING (false);
CREATE POLICY "Service role only" ON email_report_log FOR ALL USING (false);
