-- Debts table for individual debt tracking
CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'user'
    CHECK (entity_type IN ('user', 'household')),
  entity_id UUID NOT NULL,
  name TEXT NOT NULL,
  debt_type TEXT NOT NULL
    CHECK (debt_type IN ('credit_card', 'student_loan', 'mortgage', 'auto_loan', 'personal_loan', 'medical', 'other')),
  original_balance NUMERIC NOT NULL CHECK (original_balance > 0),
  current_balance NUMERIC NOT NULL CHECK (current_balance >= 0),
  interest_rate NUMERIC NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
  minimum_payment NUMERIC NOT NULL DEFAULT 0 CHECK (minimum_payment >= 0),
  due_date_day INTEGER CHECK (due_date_day >= 1 AND due_date_day <= 31),
  linked_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

-- Personal debts
CREATE POLICY "Users manage own debts" ON debts
  FOR ALL
  USING (entity_type = 'user' AND entity_id = auth.uid())
  WITH CHECK (entity_type = 'user' AND entity_id = auth.uid());

-- Household debts
CREATE POLICY "Household members manage household debts" ON debts
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

-- Indexes
CREATE INDEX idx_debts_entity ON debts (entity_type, entity_id);
CREATE INDEX idx_debts_user ON debts (user_id);

-- Updated_at trigger
CREATE TRIGGER debts_updated_at
  BEFORE UPDATE ON debts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
