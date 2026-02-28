-- 00017_admin_page.sql
-- Adds admin support and LLM usage tracking

-- 1. Add is_admin and disabled columns to profiles
ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN disabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Create LLM usage log table
CREATE TABLE llm_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  call_type TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost_estimate NUMERIC(10, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_usage_log_created_at ON llm_usage_log(created_at);
CREATE INDEX idx_llm_usage_log_call_type ON llm_usage_log(call_type);

-- RLS: only service role can read/write llm_usage_log
ALTER TABLE llm_usage_log ENABLE ROW LEVEL SECURITY;

-- 3. Postgres views for admin aggregate metrics

CREATE VIEW admin_user_stats AS
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE subscription_tier = 'free') AS free_users,
  COUNT(*) FILTER (WHERE subscription_tier = 'starter') AS starter_users,
  COUNT(*) FILTER (WHERE subscription_tier = 'pro') AS pro_users,
  COUNT(*) FILTER (WHERE is_admin = true) AS admin_users
FROM profiles;

CREATE VIEW admin_user_trends AS
SELECT
  date_trunc('month', created_at)::date AS month,
  COUNT(*) AS new_users
FROM profiles
GROUP BY date_trunc('month', created_at)
ORDER BY month;

CREATE VIEW admin_activity_stats AS
SELECT
  (SELECT COUNT(*) FROM transactions) AS total_transactions,
  (SELECT COUNT(*) FROM reports) AS total_reports,
  (SELECT COUNT(*) FROM email_report_log) AS total_emails_sent,
  (SELECT COUNT(*) FROM goals) AS total_goals,
  (SELECT COUNT(*) FROM households) AS total_households;

CREATE VIEW admin_activity_trends AS
SELECT date_trunc('month', created_at)::date AS month, 'transactions' AS metric, COUNT(*) AS count
FROM transactions GROUP BY 1
UNION ALL
SELECT date_trunc('month', created_at)::date, 'reports', COUNT(*)
FROM reports GROUP BY 1
UNION ALL
SELECT date_trunc('month', sent_at)::date, 'emails', COUNT(*)
FROM email_report_log GROUP BY 1
UNION ALL
SELECT date_trunc('month', created_at)::date, 'goals', COUNT(*)
FROM goals GROUP BY 1
UNION ALL
SELECT date_trunc('month', created_at)::date, 'households', COUNT(*)
FROM households GROUP BY 1
ORDER BY month;

CREATE VIEW admin_llm_stats AS
SELECT
  date_trunc('month', created_at)::date AS month,
  call_type,
  COUNT(*) AS call_count,
  SUM(total_tokens) AS total_tokens,
  AVG(total_tokens)::INTEGER AS avg_tokens,
  MIN(total_tokens) AS min_tokens,
  MAX(total_tokens) AS max_tokens,
  SUM(cost_estimate) AS total_cost
FROM llm_usage_log
GROUP BY date_trunc('month', created_at), call_type
ORDER BY month, call_type;
