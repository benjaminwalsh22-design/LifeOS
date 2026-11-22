# Workers

Every worker is an edge function under `supabase/functions/<name>/index.ts`,
called by a `pg_cron` job with the `x-cron-secret` header. The cron jobs are not
in the repo because they carry the secret; they are listed with
`select jobname, schedule from cron.job`.

| worker           | schedule        | what it does                                          |
|------------------|-----------------|-------------------------------------------------------|
| transcribe-tick  | */15 min        | Opus vision on new journal photos                      |
| score-tick       | hourly          | happiness / anxiety for unscored entries               |
| photo-tick       | */30 min        | OneDrive photo index and date match                    |
| notion-backup    | every 6 h       | mirrors entries to Notion                              |
| push-tick        | */15 min        | reminders                                              |
| ynab-tick        | every 3 h       | YNAB delta sync → spend and budget                     |
| trip-tick        | every 6 h       | TripIt calendar feed → trips, away days                |
| oura-tick        | 11:00, 17:00 UTC| Oura API → sleep, hrv, rhr, resp, tdev, readiness…     |
| insight-tick     | 12:10 UTC       | nightly observations from `life_digest`                |
| health-flush     | */10 min (SQL)  | merges parked health days into the payload             |
| pen-tick         | :07 and :37     | Moleskine pen pages in OneDrive → queued journal pages |

Inbound (no cron): `health-in` (Health Auto Export, token in path — now
superseded by oura-tick), `biz-in` (Libby's firm reports), `ask-ben`,
`ms-oauth` and `oura-oauth` (OAuth start/callback/disconnect).

## Oura

Register an app at https://cloud.ouraring.com/oauth/applications with redirect
URI `https://<project>.supabase.co/functions/v1/oura-oauth/callback`, then set
`OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` as function secrets. Connect from
Settings → Oura ring. `oura-tick?days=N` backfills up to 90 days.

## Calendar

`cal-tick` (every 4 h) reads the private iCal feeds in the `CAL_FEEDS` secret —
`[{"name","url","titles":true|false}]` — expands recurring events with ical.js
and stores one row per occurrence in `cal_events` for a 120-day back / 45-day
ahead window. `my_cal_days(from,to)` gives the app per-day counts, meeting
hours, first/last times, and titles only from feeds with `titles:true`. The
reviews read it; `CAL_ME` is the address used to read your own RSVP so declined
events don't count.

## Moleskine pen

The Moleskine app backs its notebooks up to OneDrive; `pen-tick` reads them with
the OneDrive connection the photos already use (read-only). It watches any
folder or file the app has named after itself, and a folder called
`LifeOS Journal` at the top of the drive for pages saved by hand (PDF, JPG, PNG).

Each new page is drawn as a 1000-pixel JPEG into `journal-photos/<user>/<entry id>.jpg`
and added to the journal as an ordinary queued entry (`src:'pen'`, `psync:true`),
so `transcribe-tick` reads it like a page scanned with the phone. Pages are told
apart by a signature of what they draw, kept in `pen_pages`:

- a notebook from the Moleskine app waits for a page rule, `{"rule":{"file":"<file id>","only":[[1,40]]}}`
  (or `skip`, or neither for every page); pages outside the rule are never drawn, stored or imported.
  Files saved into `LifeOS Journal` by hand need no rule;
- a page seen before is skipped, wherever it now sits in the file;
- a page written on again replaces its entry (the old one is tombstoned, his note is kept);
- an empty page is noted and adds nothing; an entry he deleted is never brought back;
- a file is left alone for 20 minutes after it last changed, and more than 60 new
  pages from one file wait for `{"approve":"<file id>"}`.

`pen_state.live` is the switch. While it is false the worker finds, draws and
holds pages but does not touch the journal. With the scheduler secret:
`{"status":true}` reports what is watched and held, `{"peek":"<entry id>"}`
returns a held page's picture, `{"set":{"live":true}}` starts importing,
`{"watch":{"id","path","kind"}}` adds a folder by hand, and a PDF or picture sent
as the request body is drawn and measured without storing anything.
Checks: `tests/pen` (`npm i && node pen.test.mjs`).
