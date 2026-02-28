-- Requires Vault secrets: 'api_base_url' and 'cron_secret'
-- Set them with:
--   SELECT vault.create_secret('<url>', 'api_base_url', 'API base URL for pipeline triggers');
--   SELECT vault.create_secret('<secret>', 'cron_secret', 'CRON_SECRET for pipeline trigger auth');

-- Trigger function: when parsed_data->>'pipeline_step' is set, call the API
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
    -- On INSERT, always fire. On UPDATE, only fire if pipeline_step changed.
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.parsed_data->>'pipeline_step' IS DISTINCT FROM _step)
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

-- Fire on INSERT (new upload) and UPDATE of parsed_data (step transitions)
CREATE TRIGGER trg_dispatch_pipeline_step_insert
  AFTER INSERT ON bank_statements
  FOR EACH ROW
  EXECUTE FUNCTION dispatch_pipeline_step();

CREATE TRIGGER trg_dispatch_pipeline_step_update
  AFTER UPDATE OF parsed_data ON bank_statements
  FOR EACH ROW
  EXECUTE FUNCTION dispatch_pipeline_step();
