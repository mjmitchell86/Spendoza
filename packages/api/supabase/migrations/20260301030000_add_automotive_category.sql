-- Add "Automotive" to the default categories function for new users
CREATE OR REPLACE FUNCTION seed_default_categories()
RETURNS TRIGGER AS $$
DECLARE
  cat_name TEXT;
  categories TEXT[] := ARRAY[
    'Housing', 'Utilities', 'Groceries', 'Transportation',
    'Healthcare', 'Insurance', 'Entertainment', 'Dining Out',
    'Personal', 'Savings', 'Debt Payments', 'Subscriptions',
    'Automotive', 'Other'
  ];
BEGIN
  FOREACH cat_name IN ARRAY categories
  LOOP
    INSERT INTO categories (user_id, name, is_system_default)
    VALUES (NEW.id, cat_name, true);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add "Automotive" to all existing users who don't already have it
INSERT INTO categories (user_id, name, is_system_default)
SELECT p.id, 'Automotive', true
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.user_id = p.id AND c.name = 'Automotive'
);
