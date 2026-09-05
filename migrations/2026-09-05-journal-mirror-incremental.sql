-- The first version of the mirror trigger built a search vector for every one
-- of the 4,000 entries on every save, and then ran a correlated NOT EXISTS over
-- the jsonb array for every row: 2.9 s per write. The app saves often.
-- This version diffs first and only pays for rows whose stamp changed.
create or replace function public.journal_entries_sync()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  -- diff on (id, mt) first with the cheapest possible projection; the fourteen
  -- field extractions and the theme arrays are only built for rows that changed
  with stamp as (
    select j->>'id' as id,
           case when (j->>'mt') ~ '^\d+$' then (j->>'mt')::bigint end as mt,
           j
    from jsonb_array_elements(coalesce(new.payload->'journal', '[]'::jsonb)) j
    where coalesce(j->>'id', '') <> ''
  ),
  changed as (
    select s.id, s.mt, s.j from stamp s
    left join public.journal_entries e on e.user_id = new.user_id and e.id = s.id
    where e.id is null or e.mt is distinct from s.mt
  ),
  rows as (
    select new.user_id as user_id, c.id,
           case when (j->>'date') ~ '^\d{4}-\d{2}-\d{2}$' then (j->>'date')::date end as date,
           j->>'status' as status,
           j->>'transcription' as transcription,
           j->>'summary' as summary,
           j->>'insight' as insight,
           j->>'mood' as mood,
           coalesce(array(select jsonb_array_elements_text(
              case when jsonb_typeof(j->'themes') = 'array' then j->'themes' else '[]'::jsonb end)), '{}') as themes,
           case when (j->>'hap') ~ '^\d+$' then (j->>'hap')::smallint end as hap,
           case when (j->>'anx') ~ '^\d+$' then (j->>'anx')::smallint end as anx,
           c.mt,
           j->>'note' as note,
           j->>'dw' as dw
    from changed c
  )
  insert into public.journal_entries
        (user_id, id, date, status, transcription, summary, insight, mood, themes, hap, anx, mt, note, dw, search)
  select r.user_id, r.id, r.date, r.status, r.transcription, r.summary, r.insight, r.mood, r.themes,
         r.hap, r.anx, r.mt, r.note, r.dw,
         public.journal_search_vector(r.summary, r.themes, r.insight, r.transcription)
  from rows r
  on conflict (user_id, id) do update
     set date = excluded.date, status = excluded.status, transcription = excluded.transcription,
         summary = excluded.summary, insight = excluded.insight, mood = excluded.mood,
         themes = excluded.themes, hap = excluded.hap, anx = excluded.anx, mt = excluded.mt,
         note = excluded.note, dw = excluded.dw, search = excluded.search;

  with ids as (
    select j->>'id' as id
    from jsonb_array_elements(coalesce(new.payload->'journal', '[]'::jsonb)) j
  )
  delete from public.journal_entries e
   where e.user_id = new.user_id
     and not exists (select 1 from ids where ids.id = e.id);
  return new;
end $fn$;
