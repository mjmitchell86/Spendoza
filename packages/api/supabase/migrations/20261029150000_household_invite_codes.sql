-- Household invite codes move out of households into a head-only table.
--
-- RLS on households lets every member read the whole row, so a member could
-- read the invite code straight from PostgREST with their own JWT. Here only
-- the head of household can read or rotate the code; creating a household and
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

drop policy if exists "Head can change the invite code" on public.household_invite_codes;
create policy "Head can change the invite code" on public.household_invite_codes
  for update to authenticated
  using (
    exists (
      select 1 from public.households h
      where h.id = household_id and h.head_of_household_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.households h
      where h.id = household_id and h.head_of_household_id = auth.uid()
    )
  );

revoke all on table public.household_invite_codes from anon;
revoke insert, update, delete on table public.household_invite_codes from authenticated;
grant select on table public.household_invite_codes to authenticated;
grant update (code, updated_at) on table public.household_invite_codes to authenticated;

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
