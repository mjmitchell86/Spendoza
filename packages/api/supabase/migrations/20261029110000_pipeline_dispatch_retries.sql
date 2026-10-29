-- Dispatch pipeline retries.
-- When a step fails with retries left, executeStep writes the same
-- pipeline_step back with retry_count incremented. The trigger previously only
-- fired when pipeline_step changed, so retries were never dispatched and the
-- statement stayed "processing" forever. Also fire when retry_count changes.
CREATE OR REPLACE FUNCTION dispatch_pipeline_step()
RETURNS TRIGGER AS $$
DECLARE
  _step TEXT;
  _api_base_url TEXT;
  _cron_secret TEXT;
BEGIN
  _step := NEW.parsed_data->>'pipeline_step';

  -- Only fire when pipeline_step is set and is a known step
  IF _step IS NOT NULL AND _step IN (
    'extract_text', 'extract_transactions', 'classify_transactions', 'match_and_insert'
  ) THEN
    -- On INSERT, always fire. On UPDATE, fire if pipeline_step changed (next
    -- step) or retry_count changed (retry of the same step).
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND (
         OLD.parsed_data->>'pipeline_step' IS DISTINCT FROM _step
         OR OLD.parsed_data->>'retry_count' IS DISTINCT FROM NEW.parsed_data->>'retry_count'
       ))
    THEN
      -- Read secrets from Vault
      SELECT decrypted_secret INTO _api_base_url
      FROM vault.decrypted_secrets WHERE name = 'api_base_url';

      SELECT decrypted_secret INTO _cron_secret
      FROM vault.decrypted_secrets WHERE name = 'cron_secret';

      PERFORM net.http_post(
        url := _api_base_url || '/api/internal/process-step',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _cron_secret
        ),
        body := jsonb_build_object(
          'statement_id', NEW.id::text,
          'step', _step
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
