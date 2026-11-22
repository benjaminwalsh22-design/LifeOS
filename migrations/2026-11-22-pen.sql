-- The Moleskine pen. Its app backs the notebooks up to OneDrive; pen-tick reads
-- that folder, turns each new page into a picture and adds it to the journal as
-- a queued entry, which transcribe-tick then reads like any scanned page.
--
-- Nothing in the app's data changes shape. A pen page is an ordinary journal
-- entry with two extra fields (src:'pen', psync:true so the phone fetches the
-- picture). These tables are the worker's own notes; only service_role sees them.

create table if not exists public.pen_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  live       boolean not null default false,       -- false: pages are prepared and held, the journal is not touched
  folders    jsonb   not null default '[]'::jsonb, -- [{id, path, kind:'folder'|'file', pin?}] what is watched in OneDrive
  looked_at  timestamptz,                          -- when the drive was last searched for the pen's folder
  last_run   timestamptz,
  last_note  text
);

create table if not exists public.pen_files (
  user_id    uuid not null references auth.users(id) on delete cascade,
  file_id    text not null,
  name       text,
  tag        text,                                 -- the file's cTag once every page of that version is dealt with
  modified   timestamptz,
  pages      int,
  note       text,
  checked_at timestamptz,
  primary key (user_id, file_id)
);

-- one row for each page as it is drawn; a page that is written on again keeps
-- its row (the signature changes) and its journal entry is replaced
create table if not exists public.pen_pages (
  user_id    uuid not null references auth.users(id) on delete cascade,
  file_id    text not null,
  sig        text not null,                        -- signature of the page's drawing instructions
  page       int  not null,                        -- where it sits in the file now
  state      text not null default 'held',         -- held | imported | blank | deleted | parked
  entry_id   text,                                 -- the journal entry (and the name of its picture)
  prev_entry text,                                 -- the entry this one will replace when it is released
  day        text,                                 -- the date the entry starts with (the written date wins later)
  img        text,                                 -- hash of the picture
  ink        real,                                 -- share of the page that is dark
  revs       int  not null default 0,
  readds     int  not null default 0,              -- times it was put back after going missing
  first_seen timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  primary key (user_id, file_id, sig)
);
create index if not exists pen_pages_state on public.pen_pages (user_id, state);

alter table public.pen_state enable row level security;
alter table public.pen_files enable row level security;
alter table public.pen_pages enable row level security;
revoke all on public.pen_state, public.pen_files, public.pen_pages from anon, authenticated;

-- Add pen pages to the journal in one write. items = [{entry:{…}, replaces:'old id' | null}]
-- An entry he deleted is never brought back; a page written on again replaces
-- its earlier entry (which is tombstoned so every phone drops it) and keeps his note.
create or replace function public.pen_apply(uid uuid, items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  p jsonb; journal jsonb; tomb jsonb; it jsonb; e jsonb; eid text; old_id text; old jsonb;
  res jsonb := '{}'::jsonb; changed boolean := false;
begin
  select payload into p from public.lifeos_data where user_id = uid for update;
  if p is null then return jsonb_build_object('error', 'no data row'); end if;
  journal := coalesce(p->'journal', '[]'::jsonb);
  tomb    := coalesce(p->'tomb', '{}'::jsonb);
  for it in select * from jsonb_array_elements(coalesce(items, '[]'::jsonb)) loop
    e := it->'entry'; eid := e->>'id'; old_id := nullif(it->>'replaces', ''); old := null;
    if coalesce(eid, '') = '' then continue; end if;
    if tomb ? eid then res := res || jsonb_build_object(eid, 'deleted'); continue; end if;
    if exists (select 1 from jsonb_array_elements(journal) j where j->>'id' = eid) then
      res := res || jsonb_build_object(eid, 'exists'); continue;
    end if;
    if old_id is not null then
      if tomb ? old_id then res := res || jsonb_build_object(eid, 'deleted'); continue; end if;
      select j into old from jsonb_array_elements(journal) j where j->>'id' = old_id limit 1;
      if old is not null then
        if coalesce(old->>'note', '') <> '' then e := e || jsonb_build_object('note', old->>'note'); end if;
        select coalesce(jsonb_agg(j order by ord), '[]'::jsonb) into journal
          from jsonb_array_elements(journal) with ordinality t(j, ord) where j->>'id' <> old_id;
        tomb := tomb || jsonb_build_object(old_id, (extract(epoch from clock_timestamp()) * 1000)::bigint);
      end if;
    end if;
    journal := journal || jsonb_build_array(e);
    res := res || jsonb_build_object(eid, case when old is not null then 'replaced' else 'added' end);
    changed := true;
  end loop;
  if changed then
    update public.lifeos_data
       set payload = jsonb_set(jsonb_set(payload, '{journal}', journal, true), '{tomb}', tomb, true),
           updated_at = now()
     where user_id = uid;
  end if;
  return res;
end $fn$;

-- Which of these entries are no longer in the journal, and whether he deleted them.
-- (A phone that saved at the wrong moment can drop a page the worker just added.)
create or replace function public.pen_missing(uid uuid, ids text[])
returns jsonb language sql security definer set search_path = public as $fn$
  select coalesce(jsonb_object_agg(i, case when (d.payload->'tomb') ? i then 'deleted' else 'lost' end), '{}'::jsonb)
  from public.lifeos_data d, unnest(ids) i
  where d.user_id = uid
    and not exists (select 1 from public.journal_entries e where e.user_id = uid and e.id = i);
$fn$;

-- Every two minutes while pages are waiting to be drawn, twice an hour otherwise.
create or replace function public.pen_pace(fast boolean)
returns text language plpgsql security definer set search_path = public, cron as $fn$
declare want text; cur text; jid bigint;
begin
  want := case when fast then '*/2 * * * *' else '7,37 * * * *' end;
  select jobid, schedule into jid, cur from cron.job where jobname = 'lifeos-pen-tick';
  if jid is null then return 'no job'; end if;
  if cur is distinct from want then perform cron.alter_job(jid, schedule := want); end if;
  return want;
end $fn$;

revoke all on function public.pen_apply(uuid, jsonb), public.pen_missing(uuid, text[]), public.pen_pace(boolean)
  from public, anon, authenticated;
grant execute on function public.pen_apply(uuid, jsonb), public.pen_missing(uuid, text[]), public.pen_pace(boolean)
  to service_role;
