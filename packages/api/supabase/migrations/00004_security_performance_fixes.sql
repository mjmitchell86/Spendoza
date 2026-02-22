-- ============================================
-- SECURITY: Set search_path on all functions
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION seed_default_categories()
RETURNS TRIGGER AS $$
DECLARE
  cat_name TEXT;
  categories TEXT[] := ARRAY[
    'Housing', 'Utilities', 'Groceries', 'Transportation',
    'Healthcare', 'Insurance', 'Entertainment', 'Dining Out',
    'Personal', 'Savings', 'Debt Payments', 'Subscriptions', 'Other'
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

CREATE OR REPLACE FUNCTION check_household_member_limit()
RETURNS TRIGGER AS $$
DECLARE
  member_count INTEGER;
BEGIN
  IF NEW.household_id IS NOT NULL THEN
    SELECT COUNT(*) INTO member_count
    FROM public.profiles
    WHERE household_id = NEW.household_id;

    IF member_count >= 10 THEN
      RAISE EXCEPTION 'Household member limit (10) reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- ============================================
-- PERFORMANCE: Wrap auth.uid() in (select ...) for RLS policies
-- ============================================

-- profiles
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can read household members" ON profiles;
CREATE POLICY "Users can read household members"
  ON profiles FOR SELECT
  USING (
    household_id IS NOT NULL AND
    household_id IN (SELECT household_id FROM profiles WHERE id = (select auth.uid()))
  );

-- households
DROP POLICY IF EXISTS "Household members can read" ON households;
CREATE POLICY "Household members can read"
  ON households FOR SELECT
  USING (id IN (SELECT household_id FROM profiles WHERE id = (select auth.uid())));

DROP POLICY IF EXISTS "Authenticated users can create households" ON households;
CREATE POLICY "Authenticated users can create households"
  ON households FOR INSERT
  WITH CHECK ((select auth.uid()) = head_of_household_id);

DROP POLICY IF EXISTS "Head can update household" ON households;
CREATE POLICY "Head can update household"
  ON households FOR UPDATE
  USING (head_of_household_id = (select auth.uid()));

-- household_invitations
DROP POLICY IF EXISTS "Head can manage invitations" ON household_invitations;
CREATE POLICY "Head can manage invitations"
  ON household_invitations FOR ALL
  USING (invited_by = (select auth.uid()));

DROP POLICY IF EXISTS "Invitees can read their invitations" ON household_invitations;
CREATE POLICY "Invitees can read their invitations"
  ON household_invitations FOR SELECT
  USING (email IN (SELECT email FROM auth.users WHERE id = (select auth.uid())));

-- categories
DROP POLICY IF EXISTS "Users can manage own categories" ON categories;
CREATE POLICY "Users can manage own categories"
  ON categories FOR ALL
  USING (user_id = (select auth.uid()));

-- income_entries
DROP POLICY IF EXISTS "Users can manage own income" ON income_entries;
CREATE POLICY "Users can manage own income"
  ON income_entries FOR ALL
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read income attributed to them" ON income_entries;
CREATE POLICY "Users can read income attributed to them"
  ON income_entries FOR SELECT
  USING (attributed_to_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update income attributed to them" ON income_entries;
CREATE POLICY "Users can update income attributed to them"
  ON income_entries FOR UPDATE
  USING (attributed_to_user_id = (select auth.uid()));

-- expenses
DROP POLICY IF EXISTS "Users can manage own expenses" ON expenses;
CREATE POLICY "Users can manage own expenses"
  ON expenses FOR ALL
  USING (user_id = (select auth.uid()));

-- bank_statements
DROP POLICY IF EXISTS "Users can manage own statements" ON bank_statements;
CREATE POLICY "Users can manage own statements"
  ON bank_statements FOR ALL
  USING (user_id = (select auth.uid()));

-- transactions
DROP POLICY IF EXISTS "Users can manage own transactions" ON transactions;
CREATE POLICY "Users can manage own transactions"
  ON transactions FOR ALL
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read transactions attributed to them" ON transactions;
CREATE POLICY "Users can read transactions attributed to them"
  ON transactions FOR SELECT
  USING (attributed_to_user_id = (select auth.uid()));

-- reports
DROP POLICY IF EXISTS "Users can read own reports" ON reports;
CREATE POLICY "Users can read own reports"
  ON reports FOR SELECT
  USING (
    (entity_type = 'user' AND entity_id = (select auth.uid())) OR
    (entity_type = 'household' AND entity_id IN (
      SELECT household_id FROM profiles WHERE id = (select auth.uid())
    ))
  );

-- report_requests
DROP POLICY IF EXISTS "Users can manage own report requests" ON report_requests;
CREATE POLICY "Users can manage own report requests"
  ON report_requests FOR ALL
  USING (user_id = (select auth.uid()));

-- ============================================
-- PERFORMANCE: Add missing indexes on foreign keys
-- ============================================

CREATE INDEX IF NOT EXISTS idx_expenses_bank_statement ON expenses(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_income_entries_bank_statement ON income_entries(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_households_head ON households(head_of_household_id);
CREATE INDEX IF NOT EXISTS idx_household_invitations_invited_by ON household_invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_transactions_matched_expense ON transactions(matched_expense_id);
CREATE INDEX IF NOT EXISTS idx_transactions_matched_income ON transactions(matched_income_id);
