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
  add column if not exists last_sent_at timestamptz not null default now();

-- Emails are stored and matched lowercased.
update public.household_invitations set email = lower(email) where email <> lower(email);

-- Backfill: pending invitations get a fresh 10-char Crockford base-32 code
-- (same alphabet as household codes). Other rows stay null.
create or replace function pg_temp.new_invitation_code() returns text
language plpgsql as $$
declare
  alphabet constant text := '0123456789abcdefghjkmnpqrstvwxyz';
  result text := '';
begin
  for i in 1..10 loop
    result := result || substr(alphabet, 1 + floor(random() * 32)::int, 1);
  end loop;
  return result;
end $$;

do $$
declare
  r record;
  c text;
begin
  for r in select id from public.household_invitations
           where status = 'pending' and code is null loop
    loop
      c := pg_temp.new_invitation_code();
      exit when not exists (
        select 1 from public.household_invitations where code = c
      );
    end loop;
    update public.household_invitations set code = c where id = r.id;
  end loop;
end $$;

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
