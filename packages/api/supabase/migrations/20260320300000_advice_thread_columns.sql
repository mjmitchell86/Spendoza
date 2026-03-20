-- Add thread support to advice_questions
ALTER TABLE advice_questions
  ADD COLUMN thread_id UUID REFERENCES advice_questions(id) ON DELETE CASCADE,
  ADD COLUMN message_index SMALLINT NOT NULL DEFAULT 0;

-- Backfill: existing rows are standalone threads (thread_id = own id)
UPDATE advice_questions SET thread_id = id WHERE thread_id IS NULL;

-- Make thread_id NOT NULL after backfill
ALTER TABLE advice_questions ALTER COLUMN thread_id SET NOT NULL;

-- Index for fetching thread messages
CREATE INDEX idx_advice_questions_thread
  ON advice_questions (thread_id, message_index ASC);
