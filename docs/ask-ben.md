# Ask Ben

A coach inside the journal tab that answers in two voices — **Past Ben**, who only
says what the journal actually says and cites it by date, and **Future Ben**, who
holds the charter and asks the harder question. It replaced the old "Chat" button.

## Data flow

```
index.html  ──POST /functions/v1/ask-ben (user JWT)──▶  edge function
                                                          │
   ◀── SSE: session · tool · delta · done · error ◀───────┤
                                                          │
                       coach_index (private) ─── system prompt, cached
                       journal_entries       ─── search_entries / read_entry
                       coach_sessions/turns  ─── history, RLS
```

1. The app sends `{question, voice, depth, session_id?}` with the signed-in user's
   JWT. The function verifies the JWT, then works with the service role.
2. The system prompt is the exact coach prompt plus the **compact index**
   (`wisdom_index` with loop evidence trimmed to three items, `future_ben`, and the
   `voice_pool`). It is sent with `cache_control: ephemeral`, so after the first
   call in a five-minute window the ~34k-token prompt is read from cache.
3. The model can call three tools, all server-side:
   - `get_index(year)` — the full year file from `coach_index` (`years/2022` etc.).
   - `search_journal(query, year?, limit?)` — `search_entries()` full-text over
     `journal_entries` (summary and themes weighted A, insight B, transcript C).
   - `read_entry(entry_id)` — one transcript, cleaned. **Quick** depth allows one
     search and no reads; **Deep** allows three searches and two reads.
4. Every text delta streams to the app as it is produced. Tool calls stream as
   `tool` events so the log shows while they run.
5. When the model stops, the answer is post-processed:
   - `trimPreamble` drops anything before the first `##` heading.
   - `verifyQuotes` checks every blockquote, and every inline quote that is
     *attributed* (preceded by wrote/said/journal/"in 2022:" or followed by a
     date), against the set of quotes in the index plus the transcripts actually
     read this turn. A quote that is not a substring of any of those is marked
     `*(unverified — not found in the journal)*` and counted.
   - `parseSources` turns the `## Sources` list into `[{date,label,entry_id}]`.
6. The turn is stored in `coach_turns` (markdown, sources, tool log, unverified
   count, model) and the session's `updated_at` moves; the app receives `done`.

## Where the index lives

The distilled index files are **never in the repo** — GitHub Pages serves every
file in the repo to anyone with the URL. They live in `public.coach_index`, one
row per key, readable by `service_role` only:

| key            | contents                                         |
|----------------|--------------------------------------------------|
| `wisdom_index` | loops, tells, rules, each with dated evidence     |
| `future_ben`   | the charter                                      |
| `voice_pool`   | short lines in Ben's own words, for the masthead |
| `years/2015`…  | one file per year, fetched on demand             |
| `how_built`    | provenance notes                                 |

The only piece the client ever sees is one random `voice_pool` line at a time,
via the `voice_line()` RPC.

Links inside the index point at Notion pages. `tools/load_index.py` rewrites
each `app.notion.com/<page id>` to the LifeOS `entry_id` using the
`notion_synced` table before loading, so a citation opens the entry in the app.

## Swapping in a rebuilt index

1. Put the new `wisdom_index.json`, `future_ben.json`, `voice_pool.json`,
   `years/*.json` and `how_built.md` in a folder.
2. Run `python3 tools/load_index.py <folder> out.sql`. It rewrites links, reports
   any that could not be mapped, and writes one upsert per key. Apply `out.sql`
   as the service role (psql or the Supabase management API); `updated_at` moves.
3. Nothing else changes. The next `ask-ben` call reads the new rows; the prompt
   cache simply misses once.

Phase 3 turns this into an edge function on a cron that rebuilds from
`journal_entries` directly.

## Tables

- `journal_entries` — the journal as rows, mirrored from the `lifeos_data.payload`
  jsonb by the `journal_entries_t` trigger (only rows whose `mt` changed are
  touched). Everything server-side should read this, not the blob.
- `coach_sessions`, `coach_turns` — RLS: the signed-in user can select their own;
  only the service role writes.
- `coach_index` — service role only.

## Secrets and knobs

`ASK_BEN_DEEP_MODEL` (default `claude-sonnet-4-5`) and `ASK_BEN_QUICK_MODEL`
(default `claude-haiku-4-5`) as edge-function secrets. The Anthropic key is the
one saved in the app's settings (`payload.settings.apiKey`).

## Tests

```
deno test --allow-env --allow-net tests/
psql "$DATABASE_URL" -f tests/search.smoke.sql
```

## Deploy

```
curl -X POST "https://api.supabase.com/v1/projects/$PROJECT/functions/deploy?slug=ask-ben" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"ask-ben","verify_jwt":false};type=application/json' \
  -F "file=@supabase/functions/ask-ben/index.ts;type=application/typescript"
```

`verify_jwt` is off at the gateway because the function checks the JWT itself
and returns 401 without one.
