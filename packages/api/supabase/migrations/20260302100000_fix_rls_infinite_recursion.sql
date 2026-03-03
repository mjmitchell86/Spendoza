-- Fix infinite recursion in RLS policies that reference the profiles table.
--
-- Multiple policies use `SELECT household_id FROM profiles WHERE id = auth.uid()`
-- in their USING/WITH CHECK clauses. When the profiles table itself has such a
-- policy ("Users can read household members"), PostgreSQL detects infinite
-- recursion: evaluating the profiles policy triggers a subquery on profiles,
-- which re-triggers the same policy.
--
-- Solution: replace all inline subqueries with a SECURITY DEFINER function
-- that reads from profiles without going through RLS.

-- 1. Create helper function (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_my_household_id()
RETURNS UUID AS $$
  SELECT household_id FROM public.profiles WHERE id = (select auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- 2. Fix profiles self-referencing policy
DROP POLICY IF EXISTS "Users can read household members" ON profiles;
CREATE POLICY "Users can read household members"
  ON profiles FOR SELECT
  USING (
    household_id IS NOT NULL AND
    household_id = public.get_my_household_id()
  );

-- 3. Fix households policy
DROP POLICY IF EXISTS "Household members can read" ON households;
CREATE POLICY "Household members can read"
  ON households FOR SELECT
  USING (id = public.get_my_household_id());

-- 4. Fix goals policy
DROP POLICY IF EXISTS "Household members manage household goals" ON goals;
CREATE POLICY "Household members manage household goals"
  ON goals FOR ALL
  USING (
    entity_type = 'household' AND
    entity_id = public.get_my_household_id()
  )
  WITH CHECK (
    entity_type = 'household' AND
    entity_id = public.get_my_household_id()
  );

-- 5. Fix debts policy
DROP POLICY IF EXISTS "Household members manage household debts" ON debts;
CREATE POLICY "Household members manage household debts"
  ON debts FOR ALL
  USING (
    entity_type = 'household' AND
    entity_id = public.get_my_household_id()
  )
  WITH CHECK (
    entity_type = 'household' AND
    entity_id = public.get_my_household_id()
  );

-- 6. Fix reports policies
DROP POLICY IF EXISTS "Users can read own reports" ON reports;
CREATE POLICY "Users can read own reports"
  ON reports FOR SELECT
  USING (
    (entity_type = 'user' AND entity_id = (select auth.uid())) OR
    (entity_type = 'household' AND entity_id = public.get_my_household_id())
  );

DROP POLICY IF EXISTS "Users can insert own reports" ON reports;
CREATE POLICY "Users can insert own reports"
  ON reports FOR INSERT
  WITH CHECK (
    (entity_type = 'user' AND entity_id = (select auth.uid())) OR
    (entity_type = 'household' AND entity_id = public.get_my_household_id())
  );

DROP POLICY IF EXISTS "Users can update own reports" ON reports;
CREATE POLICY "Users can update own reports"
  ON reports FOR UPDATE
  USING (
    (entity_type = 'user' AND entity_id = (select auth.uid())) OR
    (entity_type = 'household' AND entity_id = public.get_my_household_id())
  );
