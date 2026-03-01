-- Fix seed_default_categories to set correct budget_class for new users.
-- Previously the trigger inserted all categories without specifying budget_class,
-- so they all defaulted to 'want'.
CREATE OR REPLACE FUNCTION seed_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, is_system_default, budget_class) VALUES
    (NEW.id, 'Housing',        true, 'need'),
    (NEW.id, 'Utilities',      true, 'need'),
    (NEW.id, 'Groceries',      true, 'need'),
    (NEW.id, 'Transportation', true, 'need'),
    (NEW.id, 'Healthcare',     true, 'need'),
    (NEW.id, 'Insurance',      true, 'need'),
    (NEW.id, 'Entertainment',  true, 'want'),
    (NEW.id, 'Dining Out',     true, 'want'),
    (NEW.id, 'Personal',       true, 'want'),
    (NEW.id, 'Subscriptions',  true, 'want'),
    (NEW.id, 'Automotive',     true, 'want'),
    (NEW.id, 'Savings',        true, 'savings'),
    (NEW.id, 'Debt Payments',  true, 'savings'),
    (NEW.id, 'Other',          true, 'other');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Fix any existing categories that still have wrong budget_class
UPDATE categories SET budget_class = 'need' WHERE is_system_default = true AND name IN ('Housing', 'Utilities', 'Groceries', 'Transportation', 'Healthcare', 'Insurance');
UPDATE categories SET budget_class = 'savings' WHERE is_system_default = true AND name IN ('Savings', 'Debt Payments');
UPDATE categories SET budget_class = 'other' WHERE is_system_default = true AND name = 'Other';
