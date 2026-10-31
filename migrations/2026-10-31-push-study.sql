-- The 8pm study reminder for Quest for Knowledge (test 28 Nov 2026). push_facts
-- learns whether tonight is already logged in the study hub so the reminder
-- stays quiet on nights he has done the work.
create or replace function public.push_facts(uid uuid, day text)
returns jsonb language sql security definer set search_path = public as $fn$
  select jsonb_build_object(
    'has_today', exists(
      select 1 from public.lifeos_data d, lateral jsonb_array_elements(d.payload->'journal') j
      where d.user_id = uid and j->>'date' = day),
    'last_entry', (
      select max(j->>'date') from public.lifeos_data d, lateral jsonb_array_elements(d.payload->'journal') j
      where d.user_id = uid and j->>'date' <= day and (j->>'date') ~ '^\d{4}-\d{2}-\d{2}$'),
    'bdays', coalesce((
      select jsonb_agg(f->>'name') from public.lifeos_data d, lateral jsonb_array_elements(d.payload->'friends') f
      where d.user_id = uid and f->>'birthday' is not null and right(f->>'birthday', 5) = right(day, 5)
    ), '[]'::jsonb),
    'studied', exists(
      select 1 from public.lifeos_data d where d.user_id = uid and (d.payload->'study'->'log') ? day));
$fn$;
revoke all on function public.push_facts(uuid, text) from public, anon, authenticated;
grant execute on function public.push_facts(uuid, text) to service_role;
