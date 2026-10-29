-- The MCP server reads and writes these tables only with the service role key,
-- which bypasses RLS. The "for all using (true)" policies from
-- 20260324000000_mcp_oauth_tables.sql also let the anon and authenticated roles
-- read and write them through the REST API, and mcp_auth_codes holds users'
-- Supabase tokens. Drop those policies and the table grants so RLS denies
-- every role except the service role.

drop policy if exists "Service role manages auth codes" on mcp_auth_codes;
drop policy if exists "Service role manages clients" on mcp_clients;

revoke all on table mcp_auth_codes from anon, authenticated;
revoke all on table mcp_clients from anon, authenticated;

-- Codes are single-use and short-lived; drop any that were stored before this
-- migration so tokens that may have been exposed don't stay in the table.
delete from mcp_auth_codes;
