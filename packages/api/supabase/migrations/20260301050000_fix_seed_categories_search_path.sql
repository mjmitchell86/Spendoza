-- Fix seed_default_categories: restore SET search_path and qualify table names
-- The automotive category migration accidentally dropped these security settings
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
    INSERT INTO public.categories (user_id, name, is_system_default)
    VALUES (NEW.id, cat_name, true);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
