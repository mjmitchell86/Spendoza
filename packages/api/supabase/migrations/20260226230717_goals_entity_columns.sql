-- Add entity_type and entity_id to goals table
ALTER TABLE goals
  ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'user'
    CHECK (entity_type IN ('user', 'household')),
  ADD COLUMN entity_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Backfill existing goals: entity_type='user', entity_id=user_id
UPDATE goals SET entity_type = 'user', entity_id = user_id;

-- Remove the placeholder default now that existing rows are backfilled
ALTER TABLE goals ALTER COLUMN entity_id DROP DEFAULT;

-- Index for efficient entity-based queries
CREATE INDEX idx_goals_entity ON goals (entity_type, entity_id);

-- Replace the old RLS policy with entity-aware policies
DROP POLICY IF EXISTS "Users manage own goals" ON goals;

-- Personal goals: user can manage goals where entity_id = their user id
CREATE POLICY "Users manage own goals" ON goals
  FOR ALL
  USING (entity_type = 'user' AND entity_id = auth.uid())
  WITH CHECK (entity_type = 'user' AND entity_id = auth.uid());

-- Household goals: any member of that household can manage
CREATE POLICY "Household members manage household goals" ON goals
  FOR ALL
  USING (
    entity_type = 'household'
    AND entity_id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    entity_type = 'household'
    AND entity_id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  );
