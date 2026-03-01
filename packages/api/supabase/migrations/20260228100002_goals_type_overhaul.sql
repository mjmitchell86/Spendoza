-- Drop old constraint first so renames don't violate it
ALTER TABLE goals DROP CONSTRAINT goals_goal_type_check;

-- Rename existing goal types
UPDATE goals SET goal_type = 'savings_amount' WHERE goal_type = 'monthly_savings';
UPDATE goals SET goal_type = 'target_savings' WHERE goal_type = 'total_savings';

-- Add new constraint with all 6 types
ALTER TABLE goals ADD CONSTRAINT goals_goal_type_check
  CHECK (goal_type IN ('budget', 'savings_amount', 'savings_rate', 'emergency_fund', 'debt_payoff', 'target_savings'));

-- Add debt link (nullable FK to debts table)
ALTER TABLE goals ADD COLUMN debt_id UUID REFERENCES debts(id) ON DELETE SET NULL;
