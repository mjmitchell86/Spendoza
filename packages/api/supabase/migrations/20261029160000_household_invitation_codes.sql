-- Household invitations get their own secret code, a resend timestamp and
-- lowercased emails.
--
-- Accepting or declining an invitation needs the code from the invitation
-- email, because sign-up does not verify email ownership: an account with the
-- invited address is not proof the person owns that inbox. The code must never
-- reach a client, so clients lose direct access to this table; every invitation
-- read and write goes through the API (service role).

alter table public.household_invitations
  add column if not exists code text,
  add column if not exists last_sent_at timestamptz;

-- Emails are stored and matched lowercased.
update public.household_invitations set email = lower(email) where email <> lower(email);

-- Existing pending invitations keep code = null and last_sent_at = null on
-- purpose: SQL random() is not a CSPRNG, so no codes are generated here. A
-- legacy invitation cannot be accepted until the head resends it, which
-- generates the code in the API; a null last_sent_at means "never sent", so
-- that resend is allowed right away.

create unique index if not exists household_invitations_code_key
  on public.household_invitations (code);

-- Clients no longer touch invitations directly: the invitee policies would
-- expose the code (and let an unverified account flip status), and heads
-- manage invitations through the API.
drop policy if exists "Invitees can read their invitations" on public.household_invitations;
drop policy if exists "Invitees can accept their invitations" on public.household_invitations;

revoke all on table public.household_invitations from anon, authenticated;
grant select (id, household_id, email, status, invited_by, created_at, expires_at, last_sent_at)
  on table public.household_invitations to authenticated;
