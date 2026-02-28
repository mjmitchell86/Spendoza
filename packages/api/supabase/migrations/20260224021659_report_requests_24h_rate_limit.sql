-- Change report_requests from monthly counter to individual rows for 24h rolling window
-- Drop the unique constraint on (user_id, report_month) so we can insert multiple rows
ALTER TABLE report_requests DROP CONSTRAINT IF EXISTS report_requests_user_id_report_month_key;

-- Drop the old index
DROP INDEX IF EXISTS idx_report_requests_user_month;

-- Add index for 24h window queries
CREATE INDEX idx_report_requests_user_created ON report_requests(user_id, created_at DESC);
