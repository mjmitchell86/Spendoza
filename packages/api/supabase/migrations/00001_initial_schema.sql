-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE income_sharing_mode AS ENUM ('all', 'none', 'partial');
CREATE TYPE expense_sharing_mode AS ENUM ('all', 'none', 'category');
CREATE TYPE frequency_type AS ENUM ('one_time', 'weekly', 'biweekly', 'monthly', 'annually');
CREATE TYPE expense_frequency AS ENUM ('one_time', 'recurring');
CREATE TYPE recurrence_interval AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'annually');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'revoked');
CREATE TYPE statement_status AS ENUM ('uploaded', 'processing', 'parsed', 'failed');
CREATE TYPE transaction_type AS ENUM ('credit', 'debit');
CREATE TYPE entity_type AS ENUM ('user', 'household');

-- ============================================
-- TABLES
-- ============================================

-- Households (created before profiles so profiles can FK to it)
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  head_of_household_id UUID NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  income_sharing_mode income_sharing_mode NOT NULL DEFAULT 'none',
  shared_income_amount NUMERIC,
  expense_sharing_mode expense_sharing_mode NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from households.head_of_household_id to profiles after profiles exists
ALTER TABLE households
  ADD CONSTRAINT fk_head_of_household
  FOREIGN KEY (head_of_household_id) REFERENCES profiles(id);

-- Household invitations
CREATE TABLE household_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_shared_with_household BOOLEAN NOT NULL DEFAULT false,
  is_system_default BOOLEAN NOT NULL DEFAULT false,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Income entries
CREATE TABLE income_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attributed_to_user_id UUID REFERENCES profiles(id),
  source_name TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  frequency frequency_type NOT NULL,
  effective_date DATE NOT NULL,
  end_date DATE,
  is_ai_suggested BOOLEAN NOT NULL DEFAULT false,
  bank_statement_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  frequency expense_frequency NOT NULL,
  recurrence_interval recurrence_interval,
  next_due_date DATE NOT NULL,
  end_date DATE,
  is_ai_adjusted BOOLEAN NOT NULL DEFAULT false,
  original_amount NUMERIC,
  bank_statement_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bank statements
CREATE TABLE bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  bank_name TEXT,
  statement_month DATE NOT NULL,
  is_shared_account BOOLEAN NOT NULL DEFAULT false,
  account_label TEXT,
  status statement_status NOT NULL DEFAULT 'uploaded',
  parsed_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, file_hash)
);

-- Add FK from income_entries and expenses to bank_statements
ALTER TABLE income_entries
  ADD CONSTRAINT fk_income_bank_statement
  FOREIGN KEY (bank_statement_id) REFERENCES bank_statements(id);

ALTER TABLE expenses
  ADD CONSTRAINT fk_expense_bank_statement
  FOREIGN KEY (bank_statement_id) REFERENCES bank_statements(id);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attributed_to_user_id UUID REFERENCES profiles(id),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  type transaction_type NOT NULL,
  ai_category TEXT,
  matched_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  matched_income_id UUID REFERENCES income_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  report_month DATE NOT NULL,
  report_data JSONB NOT NULL DEFAULT '{}',
  ai_insights TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  has_new_data BOOLEAN NOT NULL DEFAULT true
);

-- Report requests
CREATE TABLE report_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_month DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, report_month)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_profiles_household ON profiles(household_id);
CREATE INDEX idx_household_invitations_household ON household_invitations(household_id);
CREATE INDEX idx_household_invitations_email ON household_invitations(email);
CREATE INDEX idx_categories_user ON categories(user_id);
CREATE INDEX idx_income_entries_user ON income_entries(user_id);
CREATE INDEX idx_income_entries_attributed ON income_entries(attributed_to_user_id);
CREATE INDEX idx_expenses_user ON expenses(user_id);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_bank_statements_user ON bank_statements(user_id);
CREATE INDEX idx_transactions_statement ON transactions(bank_statement_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_attributed ON transactions(attributed_to_user_id);
CREATE INDEX idx_reports_entity ON reports(entity_type, entity_id);
CREATE INDEX idx_reports_month ON reports(report_month);
CREATE INDEX idx_report_requests_user_month ON report_requests(user_id, report_month);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Seed default categories on profile creation
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
    INSERT INTO categories (user_id, name, is_system_default)
    VALUES (NEW.id, cat_name, true);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION seed_default_categories();

-- Household member count limit (max 10)
CREATE OR REPLACE FUNCTION check_household_member_limit()
RETURNS TRIGGER AS $$
DECLARE
  member_count INTEGER;
BEGIN
  IF NEW.household_id IS NOT NULL THEN
    SELECT COUNT(*) INTO member_count
    FROM profiles
    WHERE household_id = NEW.household_id;

    IF member_count >= 10 THEN
      RAISE EXCEPTION 'Household member limit (10) reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_household_limit
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (OLD.household_id IS DISTINCT FROM NEW.household_id AND NEW.household_id IS NOT NULL)
  EXECUTE FUNCTION check_household_member_limit();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_income_entries_updated_at
  BEFORE UPDATE ON income_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_requests ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Profiles: users can read household members' profiles
CREATE POLICY "Users can read household members"
  ON profiles FOR SELECT
  USING (
    household_id IS NOT NULL AND
    household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Households: members can read their household
CREATE POLICY "Household members can read"
  ON households FOR SELECT
  USING (id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));

-- Households: any authenticated user can create
CREATE POLICY "Authenticated users can create households"
  ON households FOR INSERT
  WITH CHECK (auth.uid() = head_of_household_id);

-- Households: head can update
CREATE POLICY "Head can update household"
  ON households FOR UPDATE
  USING (head_of_household_id = auth.uid());

-- Household invitations: head can manage
CREATE POLICY "Head can manage invitations"
  ON household_invitations FOR ALL
  USING (invited_by = auth.uid());

-- Household invitations: invitees can read their invites
CREATE POLICY "Invitees can read their invitations"
  ON household_invitations FOR SELECT
  USING (email IN (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Categories: users own their categories
CREATE POLICY "Users can manage own categories"
  ON categories FOR ALL
  USING (user_id = auth.uid());

-- Income entries: users own their entries + can see attributed entries
CREATE POLICY "Users can manage own income"
  ON income_entries FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can read income attributed to them"
  ON income_entries FOR SELECT
  USING (attributed_to_user_id = auth.uid());

CREATE POLICY "Users can update income attributed to them"
  ON income_entries FOR UPDATE
  USING (attributed_to_user_id = auth.uid());

-- Expenses: users own their expenses
CREATE POLICY "Users can manage own expenses"
  ON expenses FOR ALL
  USING (user_id = auth.uid());

-- Bank statements: users own their statements
CREATE POLICY "Users can manage own statements"
  ON bank_statements FOR ALL
  USING (user_id = auth.uid());

-- Transactions: users own their transactions
CREATE POLICY "Users can manage own transactions"
  ON transactions FOR ALL
  USING (user_id = auth.uid());

-- Transactions: users can read transactions attributed to them
CREATE POLICY "Users can read transactions attributed to them"
  ON transactions FOR SELECT
  USING (attributed_to_user_id = auth.uid());

-- Reports: users can read their own reports
CREATE POLICY "Users can read own reports"
  ON reports FOR SELECT
  USING (
    (entity_type = 'user' AND entity_id = auth.uid()) OR
    (entity_type = 'household' AND entity_id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    ))
  );

-- Report requests: users own their requests
CREATE POLICY "Users can manage own report requests"
  ON report_requests FOR ALL
  USING (user_id = auth.uid());
