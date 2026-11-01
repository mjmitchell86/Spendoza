-- How categories count toward the savings rate:
--   * 'savings' (Savings) is money kept — saved, not spent.
--   * new 'transfer' (Transfers) is money moving between the person's own accounts — neither income nor
--     spending.
--   * the default Debt Payments category becomes 'other': still spending, but not scored as a need or a
--     want (a whole credit-card payment would swamp the needs share). It used to be 'savings', which would
--     now make every card payment filed there look "saved".
-- Every report is marked as having new data so it is rebuilt with the corrected math the next time it is
-- opened, and a category change from now on marks its owner's reports the same way.

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
    (NEW.id, 'Debt Payments',  true, 'other'),
    (NEW.id, 'Transfers',      true, 'transfer'),
    (NEW.id, 'Other',          true, 'other');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- The default Debt Payments category counts as other spending from now on (custom ones keep their class).
UPDATE public.categories SET budget_class = 'other'
WHERE is_system_default = true AND name = 'Debt Payments' AND budget_class = 'savings';

-- A category someone already named Transfers now counts as one; everyone else gets a Transfers category.
UPDATE public.categories SET budget_class = 'transfer'
WHERE lower(name) = 'transfers' AND budget_class <> 'transfer';

INSERT INTO public.categories (user_id, name, is_system_default, budget_class)
SELECT p.id, 'Transfers', true, 'transfer'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.user_id = p.id AND lower(c.name) = 'transfers'
);

-- A category's name and class decide how its transactions count, so changing, adding or deleting one
-- marks its owner's reports (and their household's) as having new data.
CREATE OR REPLACE FUNCTION public.mark_reports_stale_on_category_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_id UUID := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  UPDATE public.reports r
  SET has_new_data = true
  WHERE r.has_new_data = false
    AND (
      (r.entity_type = 'user' AND r.entity_id = owner_id)
      OR (r.entity_type = 'household'
          AND r.entity_id = (SELECT p.household_id FROM public.profiles p WHERE p.id = owner_id))
    );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_reports_stale_on_category_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS categories_mark_reports_stale ON public.categories;
CREATE TRIGGER categories_mark_reports_stale
  AFTER INSERT OR DELETE OR UPDATE OF name, budget_class ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.mark_reports_stale_on_category_change();

UPDATE public.reports SET has_new_data = true WHERE has_new_data = false;
