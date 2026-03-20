-- Add matched_debt_id to transactions for linking payments to debts
ALTER TABLE transactions
  ADD COLUMN matched_debt_id UUID REFERENCES debts(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_matched_debt
  ON transactions (matched_debt_id)
  WHERE matched_debt_id IS NOT NULL;
