-- packages/mcp/src/auth/oauth.ts reads and writes columns that
-- 20260324000000_mcp_oauth_tables.sql never created (client_data on
-- mcp_clients; access_token, refresh_token, expires_in and created_at on
-- mcp_auth_codes) and never sets the NOT NULL supabase_* token columns or
-- redirect_uri. On a database built from migrations, client registration and
-- code storage fail, and the code-expiry check (which reads created_at) never
-- fires. Every statement is a no-op where an environment was already changed
-- by hand to match the code.

alter table mcp_clients add column if not exists client_data jsonb;

alter table mcp_auth_codes add column if not exists access_token text;
alter table mcp_auth_codes add column if not exists refresh_token text;
alter table mcp_auth_codes add column if not exists expires_in integer;
alter table mcp_auth_codes add column if not exists created_at timestamptz not null default now();

do $$
declare
  col text;
begin
  foreach col in array array['supabase_access_token', 'supabase_refresh_token', 'redirect_uri'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'mcp_auth_codes' and column_name = col
    ) then
      execute format('alter table mcp_auth_codes alter column %I drop not null', col);
    end if;
  end loop;
end $$;
