-- Lock-down, prompted by Supabase's advisor mail of 6 Sep 2026.
--
-- Tables and functions created through the management API inherited Supabase's
-- default grants: anon and authenticated could execute every function (including
-- security-definer ones keyed by user id), authenticated could SELECT several
-- tables that have no row-level security, and anon held TRUNCATE on nearly all
-- of them. The anon key ships in the public app, and sign-ups were open.
--
-- After this: anon can do nothing in public; authenticated can call only the
-- app's own my_*/photo/voice functions and read only RLS-guarded tables; the
-- workers keep everything through service_role; sign-ups are closed separately
-- (auth config, disable_signup).

-- ---------------------------------------------------------------- anon: nothing
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke execute on all functions in schema public from public;
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke all on functions from public;

-- ---------------------------------------------------------------- authenticated: only what the app calls
revoke all on all functions in schema public from authenticated;
alter default privileges for role postgres in schema public revoke all on functions from authenticated;
grant execute on function public.my_digest()                                  to authenticated;
grant execute on function public.latest_insights()                            to authenticated;
grant execute on function public.kick_insights()                              to authenticated;
grant execute on function public.my_search_entries(text, int, int)            to authenticated;
grant execute on function public.my_cycle_today()                             to authenticated;
grant execute on function public.my_cycle_start(date)                         to authenticated;
grant execute on function public.my_cycle_undo()                              to authenticated;
grant execute on function public.photo_status()                               to authenticated;
grant execute on function public.photos_for(text[])                           to authenticated;
grant execute on function public.photos_in_month(text, int)                   to authenticated;
grant execute on function public.trip_places()                                to authenticated;
grant execute on function public.voice_line()                                 to authenticated;
-- trigger functions fire on the app's own writes to lifeos_data
grant execute on function public.journal_entries_sync()                       to authenticated;
grant execute on function public.lifeos_flags_sync()                          to authenticated;
-- the workers
grant execute on all functions in schema public to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- authenticated never needs these on any table
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

-- tables the app never reads directly: no grant, RLS on with no policy
revoke all on public.journal_entries, public.ynab_txn, public.ynab_state, public.biz_report, public.biz_tokens,
       public.insights, public.trips, public.lifeos_flags, public.health_inbox, public.coach_index,
       public.notion_synced, public.twy_synced, public.push_log, public.health_log, public.health_tokens,
       public.ms_auth, public.ms_state
  from authenticated;

-- row-level security on everything in public
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;
