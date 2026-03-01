-- Add budget_class to categories for 50/30/20 allocation tracking
ALTER TABLE categories
  ADD COLUMN budget_class TEXT NOT NULL DEFAULT 'want'
    CHECK (budget_class IN ('need', 'want', 'savings', 'other'));

-- Set defaults for system categories
UPDATE categories SET budget_class = 'need' WHERE is_system_default = true AND name IN (
  'Housing', 'Utilities', 'Groceries', 'Transportation', 'Healthcare', 'Insurance', 'Debt Payments'
);
UPDATE categories SET budget_class = 'want' WHERE is_system_default = true AND name IN (
  'Entertainment', 'Dining Out', 'Personal', 'Subscriptions'
);
UPDATE categories SET budget_class = 'savings' WHERE is_system_default = true AND name = 'Savings';
UPDATE categories SET budget_class = 'other' WHERE is_system_default = true AND name = 'Other';
