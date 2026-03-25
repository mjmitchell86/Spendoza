-- MCP OAuth authorization codes (PKCE)
create table if not exists mcp_auth_codes (
  code text primary key,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  supabase_access_token text not null,
  supabase_refresh_token text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  expires_at timestamptz not null default now() + interval '5 minutes',
  used boolean not null default false
);

create index if not exists idx_mcp_auth_codes_expires_at on mcp_auth_codes(expires_at);

-- MCP dynamic client registration
create table if not exists mcp_clients (
  client_id text primary key,
  client_secret text,
  client_name text,
  redirect_uris text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- RLS policies
alter table mcp_auth_codes enable row level security;
alter table mcp_clients enable row level security;

-- Only service role can manage auth codes (server-side only)
create policy "Service role manages auth codes"
  on mcp_auth_codes for all
  using (true)
  with check (true);

-- Only service role can manage clients
create policy "Service role manages clients"
  on mcp_clients for all
  using (true)
  with check (true);
