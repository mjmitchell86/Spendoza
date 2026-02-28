-- Add unique constraint needed for report upsert (entity_type + entity_id + report_month)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_entity_month
  ON reports(entity_type, entity_id, report_month);
