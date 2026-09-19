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

Inbound (no cron): `health-in` (Health Auto Export, token in path — now
superseded by oura-tick), `biz-in` (Libby's firm reports), `ask-ben`,
`ms-oauth` and `oura-oauth` (OAuth start/callback/disconnect).

## Oura

Register an app at https://cloud.ouraring.com/oauth/applications with redirect
URI `https://<project>.supabase.co/functions/v1/oura-oauth/callback`, then set
`OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` as function secrets. Connect from
Settings → Oura ring. `oura-tick?days=N` backfills up to 90 days.
