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
superseded by oura-tick), `biz-in` (Libby's firm reports), `pen-in` (Moleskine
pages from Google Drive, token in path), `ask-ben`,
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

The Moleskine app only backs up to Google Drive: a folder `Moleskine Notebooks PDF`,
a subfolder per notebook, and one PDF per written page named `<notebook>_p<page>.pdf`.
LifeOS has no Google login. A private Zapier workflow in his account
("Moleskine pages to LifeOS", source in `docs/zapier/` with the address left out)
starts whenever a new file appears in that folder and talks to `pen-in`:

1. it posts the list of page files (`{"manifest":[{id,name,md5,modified}]}`);
   `pen-in` answers with the ones it wants: inside the notebook's page rule, not
   seen before, and not already promised to another run in the last five minutes;
2. it uploads each wanted page; `pen-in` keeps the PDF in the private `pen-inbox`
   bucket and speeds `pen-tick` up, which draws the page and then deletes the PDF.

`PEN_IN_TOKEN` (a function secret) is the last part of the `pen-in` address. The
address is a credential: it lives in the Zapier workflow and nowhere else.

Each page is drawn as a 1000-pixel JPEG into `journal-photos/<user>/<entry id>.jpg`
and added to the journal as an ordinary queued entry (`src:'pen'`, `psync:true`),
so `transcribe-tick` reads it like a page scanned with the phone. Pages are kept
in `pen_pages`, filed under `book:<notebook>` at their printed page numbers, and
told apart by a signature of what they draw:

- a notebook waits for a page rule, `{"rule":{"file":"book:<notebook>","only":[[1,139]]}}`
  (or `skip`, or neither for every page). Pages outside the rule are never sent,
  stored, drawn or imported; a notebook with no rule is only noted by name;
- a page seen before is skipped; a page written on again replaces its entry (the
  old one is tombstoned, his note is kept);
- an empty page is noted and adds nothing; an entry he deleted is never brought back;
- more than 60 new pages from one notebook wait for `{"approve":"<file id>"}`.

`pen_state.live` is the switch (on since 22 Nov 2026). With the scheduler secret,
`pen-tick` takes: `{"status":true}`, `{"peek":"<entry id>"}` (a page's picture),
`{"set":{"live":false}}`, the `rule` and `approve` commands above, and a PDF or
picture as the request body, which is drawn and measured without storing anything.

`pen-tick` can also read OneDrive with the photos' connection: a folder the app
has named after itself, or a top-level `LifeOS Journal` folder for pages saved by
hand (those need no rule). Nothing uses that route today.

Not yet known: whether the app, on a later backup, rewrites a page's file in place.
A changed file is picked up the next time any new page file appears; if in-place
changes turn out to be common, add a second workflow on Zapier's "Updated File"
trigger for the notebook's folder (same source).

Checks: `tests/pen` (`npm i && node pen.test.mjs`).
