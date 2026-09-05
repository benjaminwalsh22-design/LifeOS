-- Smoke test for the journal search. Runs as the service role / postgres.
-- Every block raises if the mirror or the search is broken.
do $$
declare
  uid uuid; n_blob int; n_rows int; n_unindexed int; t0 timestamptz; ms numeric; hits int;
begin
  select user_id into uid from public.lifeos_data limit 1;
  if uid is null then raise exception 'no account row'; end if;

  -- 1. the mirror has one row per journal entry in the blob
  select count(*) into n_blob
    from public.lifeos_data d, jsonb_array_elements(coalesce(d.payload->'journal','[]'::jsonb)) j
   where d.user_id = uid and coalesce(j->>'id','') <> '';
  select count(*) into n_rows from public.journal_entries where user_id = uid;
  if n_rows <> n_blob then
    raise exception 'journal_entries has % rows, blob has % entries', n_rows, n_blob;
  end if;

  -- 2. every row carries a search vector
  select count(*) into n_unindexed from public.journal_entries where user_id = uid and search is null;
  if n_unindexed > 0 then raise exception '% rows have no search vector', n_unindexed; end if;

  -- 3. a common query returns something, ranked, and fast
  t0 := clock_timestamp();
  select count(*) into hits from public.search_entries(uid, 'work stress', null, 10);
  ms := extract(milliseconds from clock_timestamp() - t0);
  if hits = 0 then raise exception 'search for "work stress" returned nothing'; end if;
  if ms > 1500 then raise exception 'search took % ms', ms; end if;

  -- 4. the year filter is honoured
  if exists (select 1 from public.search_entries(uid, 'family', 2022, 20) where extract(year from date) <> 2022) then
    raise exception 'year filter leaked another year';
  end if;

  -- 5. the masthead line comes from the private index: {date, quote, entry_id}
  if jsonb_typeof(public.voice_line()->'quote') is distinct from 'string'
     or jsonb_typeof(public.voice_line()->'entry_id') is distinct from 'string' then
    raise exception 'voice_line() did not return {quote, entry_id}';
  end if;

  raise notice 'ok: % entries mirrored, "work stress" → % hits in % ms', n_rows, hits, round(ms);
end $$;
