-- Household invite codes move out of households into a head-only table.
--
-- RLS on households lets every member read the whole row, so a member could
-- read the invite code straight from PostgREST with their own JWT. Here only
-- the head of household can read the code (the API rotates it); creating a household and
-- joining by code go through the API (service role), which bypasses RLS.

create table if not exists public.household_invite_codes (
  household_id uuid primary key references public.households(id) on delete cascade,
  code text not null unique,
  updated_at timestamptz not null default now()
);

alter table public.household_invite_codes enable row level security;

drop policy if exists "Head can view the invite code" on public.household_invite_codes;
create policy "Head can view the invite code" on public.household_invite_codes
  for select to authenticated
  using (
    exists (
      select 1 from public.households h
      where h.id = household_id and h.head_of_household_id = auth.uid()
    )
  );

-- No client UPDATE path: rotation goes through the API (service role). A direct
-- update would be an unthrottled "is code X in use?" oracle via the unique
-- violation, and would let heads set weak codes.
drop policy if exists "Head can change the invite code" on public.household_invite_codes;

revoke all on table public.household_invite_codes from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.household_invite_codes from authenticated;
revoke update (code, updated_at) on table public.household_invite_codes from authenticated;
grant select on table public.household_invite_codes to authenticated;

-- Copy existing codes (re-runnable: only while households.invite_code exists).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'households'
      and column_name = 'invite_code'
  ) then
    insert into public.household_invite_codes (household_id, code)
    select id, invite_code from public.households
    on conflict do nothing;
  end if;
end $$;

alter table public.households drop column if exists invite_code;
