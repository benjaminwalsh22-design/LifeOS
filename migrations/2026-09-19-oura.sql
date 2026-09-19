-- Oura, connected directly over OAuth2 (personal access tokens can no longer be
-- created). Tokens live server-side only; the app sees connection status.
create table if not exists public.oura_auth (
  user_id       uuid primary key,
  access_token  text not null,
  refresh_token text not null,
  expires_at    bigint not null,            -- epoch ms
  email         text,
  connected_at  timestamptz not null default now(),
  last_sync     timestamptz,
  last_error    text,
  synced_through date                       -- last day fully pulled
);
create table if not exists public.oura_state (
  state      text primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now()
);
alter table public.oura_auth  enable row level security;
alter table public.oura_state enable row level security;
revoke all on public.oura_auth, public.oura_state from anon, authenticated;
grant select, insert, update, delete on public.oura_auth, public.oura_state to service_role;

-- what the app may know: connected or not, the account, when it last pulled
create or replace function public.oura_status()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce((select jsonb_build_object('connected', true, 'email', email, 'connected_at', connected_at,
                     'last_sync', last_sync, 'last_error', last_error, 'synced_through', synced_through)
                   from public.oura_auth where user_id = auth.uid()),
                  jsonb_build_object('connected', false));
$fn$;
revoke all on function public.oura_status() from public, anon;
grant execute on function public.oura_status() to authenticated, service_role;

-- The cron job (lifeos-oura-tick, '0 11,17 * * *') is created outside the repo:
-- it carries the cron secret. See docs/workers.md.
