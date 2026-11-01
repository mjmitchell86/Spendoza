-- Transfers: money moving between the person's own accounts (including credit-card payments) counts as
-- neither income nor spending. Adds the 'transfer' budget class and a Transfers category for everyone,
-- and marks every report as having new data so it is rebuilt with the corrected math the next time it
-- is opened (savings-class money counts as saved, needs and wants are measured against income).

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_budget_class_check;
ALTER TABLE public.categories ADD CONSTRAINT categories_budget_class_check
  CHECK (budget_class IN ('need', 'want', 'savings', 'transfer', 'other'));

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
    (NEW.id, 'Transfers',      true, 'transfer'),
    (NEW.id, 'Other',          true, 'other');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- A category someone already named Transfers now counts as one; everyone else gets a Transfers category.
UPDATE public.categories SET budget_class = 'transfer'
WHERE lower(name) = 'transfers' AND budget_class <> 'transfer';

INSERT INTO public.categories (user_id, name, is_system_default, budget_class)
SELECT p.id, 'Transfers', true, 'transfer'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.user_id = p.id AND lower(c.name) = 'transfers'
);

UPDATE public.reports SET has_new_data = true WHERE has_new_data = false;
