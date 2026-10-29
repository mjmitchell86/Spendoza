-- invite_codes: owners can read their own codes; only the API writes.
--
-- 20260224011947_invite_codes.sql let every role (including anon, via the
-- public anon key) read every row, which exposed all codes and who redeemed
-- them, and let any signed-in user insert codes directly through the REST API,
-- bypassing the API's limit of 3 per user.
--
-- Every server-side read and write goes through the API:
--   - signup checks and redeems codes with the service role (routes/auth.ts)
--   - POST /api/invite-codes counts and inserts with the service role
--   - GET /api/invite-codes lists the caller's codes with their own JWT,
--     which this policy still allows
-- The service role bypasses RLS and keeps its grants.

drop policy if exists "Anyone can check invite codes" on public.invite_codes;
drop policy if exists "Users can create invite codes" on public.invite_codes;
drop policy if exists "Users can view their own invite codes" on public.invite_codes;

create policy "Users can view their own invite codes" on public.invite_codes
  for select
  to authenticated
  using ((select auth.uid()) = created_by);

-- anon gets nothing; authenticated can only read (subject to the policy above).
revoke all on table public.invite_codes from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.invite_codes from authenticated;
grant select on table public.invite_codes to authenticated;
