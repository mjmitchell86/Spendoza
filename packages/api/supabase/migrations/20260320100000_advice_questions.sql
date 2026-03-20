-- Stores user questions to the LLM financial advisor
CREATE TABLE IF NOT EXISTS advice_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_advice_questions_user_date
  ON advice_questions (user_id, created_at DESC);

-- RLS: users can only read their own questions
ALTER TABLE advice_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY advice_questions_select ON advice_questions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY advice_questions_insert ON advice_questions
  FOR INSERT WITH CHECK (false);
-- Inserts are done via service role only (supabaseAdmin)
