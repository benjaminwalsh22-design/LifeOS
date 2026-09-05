-- Ask Ben, phase 1.
--
-- 1. journal_entries: the journal as rows. The app keeps writing the jsonb
--    blob exactly as before; a trigger mirrors it here, touching only the rows
--    whose modification stamp changed. Everything that reads the journal
--    server-side should read this table, not the blob. (The coach does;
--    the other workers follow in a later migration.)
-- 2. full-text search over those rows.
-- 3. coach_index: the distilled index files, private, loaded once.
-- 4. coach_sessions / coach_turns: conversation history, row-level secured.

-- ---------------------------------------------------------------- 1. rows
create table if not exists public.journal_entries (
  user_id       uuid not null,
  id            text not null,
  date          date,
  status        text,
  transcription text,
  summary       text,
  insight       text,
  mood          text,
  themes        text[] not null default '{}',
  hap           smallint,
  anx           smallint,
  mt            bigint,
  note          text,
  dw            text,
  -- maintained by the sync trigger (array_to_string is not immutable, so this
  -- cannot be a generated column). Summary and themes carry the most signal per
  -- word; the transcript is long and weighted lowest.
  search        tsvector,
  primary key (user_id, id)
);

create or replace function public.journal_search_vector(
  summary text, themes text[], insight text, transcription text)
returns tsvector language sql immutable as $fn$
  select setweight(to_tsvector('english', coalesce(summary, '')), 'A')
      || setweight(to_tsvector('english', coalesce(array_to_string(themes, ' '), '')), 'A')
      || setweight(to_tsvector('english', coalesce(insight, '')), 'B')
      || setweight(to_tsvector('english', coalesce(transcription, '')), 'C');
$fn$;
create index if not exists journal_entries_date   on public.journal_entries (user_id, date desc);
create index if not exists journal_entries_search on public.journal_entries using gin (search);
grant select on public.journal_entries to authenticated, service_role;

create or replace function public.journal_entries_sync()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.journal_entries
        (user_id, id, date, status, transcription, summary, insight, mood, themes, hap, anx, mt, note, dw, search)
  select * from (select new.user_id,
         j->>'id',
         case when (j->>'date') ~ '^\d{4}-\d{2}-\d{2}$' then (j->>'date')::date end,
         j->>'status',
         j->>'transcription',
         j->>'summary',
         j->>'insight',
         j->>'mood',
         coalesce(array(select jsonb_array_elements_text(
            case when jsonb_typeof(j->'themes') = 'array' then j->'themes' else '[]'::jsonb end)), '{}'),
         case when (j->>'hap') ~ '^\d+$' then (j->>'hap')::smallint end,
         case when (j->>'anx') ~ '^\d+$' then (j->>'anx')::smallint end,
         case when (j->>'mt') ~ '^\d+$' then (j->>'mt')::bigint end,
         j->>'note',
         j->>'dw'
  from jsonb_array_elements(coalesce(new.payload->'journal', '[]'::jsonb)) j
  where coalesce(j->>'id', '') <> '') r(user_id, id, date, status, transcription, summary, insight, mood, themes, hap, anx, mt, note, dw)
  cross join lateral (select public.journal_search_vector(r.summary, r.themes, r.insight, r.transcription)) v(search)
  on conflict (user_id, id) do update
     set date = excluded.date, status = excluded.status, transcription = excluded.transcription,
         summary = excluded.summary, insight = excluded.insight, mood = excluded.mood,
         themes = excluded.themes, hap = excluded.hap, anx = excluded.anx, mt = excluded.mt,
         note = excluded.note, dw = excluded.dw, search = excluded.search
   where public.journal_entries.mt is distinct from excluded.mt;   -- untouched rows cost nothing

  delete from public.journal_entries e
   where e.user_id = new.user_id
     and not exists (select 1 from jsonb_array_elements(coalesce(new.payload->'journal','[]'::jsonb)) j
                      where j->>'id' = e.id);
  return new;
end $fn$;

drop trigger if exists journal_entries_t on public.lifeos_data;
create trigger journal_entries_t
after insert or update of payload on public.lifeos_data
for each row execute function public.journal_entries_sync();

-- one-time backfill: touch the row so the trigger runs
update public.lifeos_data set payload = payload;

-- ---------------------------------------------------------------- 2. search
create or replace function public.search_entries(p_uid uuid, query text, year int default null, lim int default 10)
returns table(id text, date date, mood text, summary text, rank real)
language sql stable security definer set search_path = public as $fn$
  with q as (select websearch_to_tsquery('english', query) tsq)
  select e.id, e.date, e.mood, e.summary, ts_rank_cd(e.search, q.tsq) as rank
  from public.journal_entries e, q
  where e.user_id = p_uid
    and e.search @@ q.tsq
    and (year is null or extract(year from e.date) = year)
  order by rank desc, e.date desc
  limit greatest(1, least(lim, 50));
$fn$;
grant execute on function public.search_entries(uuid, text, int, int) to service_role;

create or replace function public.my_search_entries(query text, year int default null, lim int default 10)
returns table(id text, date date, mood text, summary text, rank real)
language sql stable security definer set search_path = public as $fn$
  select * from public.search_entries(auth.uid(), query, year, lim);
$fn$;
grant execute on function public.my_search_entries(text, int, int) to authenticated;

-- ---------------------------------------------------------------- 3. index
create table if not exists public.coach_index (
  key        text primary key,          -- wisdom_index, future_ben, voice_pool, years/2019, how_built
  body       jsonb not null,
  updated_at timestamptz not null default now()
);
grant select on public.coach_index to service_role;     -- never to the client

-- ---------------------------------------------------------------- 4. history
create table if not exists public.coach_sessions (
  id             bigserial primary key,
  user_id        uuid not null,
  started_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  first_question text
);
create table if not exists public.coach_turns (
  id              bigserial primary key,
  session_id      bigint not null references public.coach_sessions(id) on delete cascade,
  user_id         uuid not null,
  asked_at        timestamptz not null default now(),
  question        text not null,
  answer_markdown text,
  voice           text not null default 'both',
  depth           text not null default 'deep',
  model           text,
  sources         jsonb not null default '[]'::jsonb,   -- [{date, label, entry_id}]
  tool_log        jsonb not null default '[]'::jsonb,
  unverified      int  not null default 0                -- blockquotes that failed verification
);
create index if not exists coach_turns_session on public.coach_turns (session_id, asked_at);
create index if not exists coach_sessions_user on public.coach_sessions (user_id, updated_at desc);

alter table public.coach_sessions enable row level security;
alter table public.coach_turns    enable row level security;
drop policy if exists coach_sessions_own on public.coach_sessions;
drop policy if exists coach_turns_own    on public.coach_turns;
create policy coach_sessions_own on public.coach_sessions for select using (user_id = auth.uid());
create policy coach_turns_own    on public.coach_turns    for select using (user_id = auth.uid());
grant select on public.coach_sessions, public.coach_turns to authenticated;
grant select, insert, update, delete on public.coach_sessions, public.coach_turns to service_role;
grant usage, select on sequence public.coach_sessions_id_seq, public.coach_turns_id_seq to service_role;

-- ---------------------------------------------------------------- 5. one line for the masthead
-- The client never reads coach_index; it gets exactly one random line at a time.
create or replace function public.voice_line()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select x from (
    select jsonb_array_elements(body) x from public.coach_index where key = 'voice_pool'
  ) z order by random() limit 1;
$fn$;
grant execute on function public.voice_line() to authenticated;
