-- Lock down what clients can write on profiles and households.
--
-- The RLS policy "Users can update own profile" (FOR UPDATE USING
-- auth.uid() = id) limits WHICH row a user can update, not WHICH columns.
-- Supabase grants UPDATE on every public table to anon/authenticated by
-- default, so with only the public anon key and their own JWT a user could
-- PATCH /rest/v1/profiles and set is_admin, subscription_tier, disabled or
-- household_id (making themselves an admin or Pro, or rejoining a household
-- they were removed from).
--
-- Fix: drop the table-wide UPDATE privilege and grant UPDATE back only on the
-- columns a user may legitimately change about themselves (the fields of
-- updateProfileSchema / updateSharingSchema in packages/shared). Every other
-- column (is_admin, disabled, subscription_tier, household_id,
-- onboarding_completed, id, created_at, updated_at, and any column added
-- later) is writable only by the service role, i.e. the API after its checks.
-- The existing RLS policy still restricts updates to the caller's own row.
--
-- REVOKE on the table also removes any column-level UPDATE grants, so this
-- migration is safe to re-run.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

-- Profiles rows are created only by the handle_new_user() trigger (SECURITY
-- DEFINER) and there is no INSERT policy; drop the unused client privileges
-- too, as was done for bank_statements.
REVOKE INSERT, TRUNCATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (
  display_name,
  avatar_url,
  income_sharing_mode,
  shared_income_amount,
  expense_sharing_mode,
  timezone,
  email_reports_enabled,
  email_report_day,
  email_report_hour
) ON public.profiles TO authenticated;

-- Households are created only by POST /api/household(s), which enforces the
-- Pro tier and one-household-per-user rule and then inserts with the service
-- role. Without this, a client could insert a households row directly via
-- PostgREST and skip those checks. The INSERT policy is left in place but is
-- now unreachable for clients.
REVOKE INSERT, TRUNCATE ON public.households FROM anon, authenticated;
