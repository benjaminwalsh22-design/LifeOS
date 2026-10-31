-- Oura in detail, 31 Oct 2026. The ring now sends sleep stages, bedtime and
-- wake time, efficiency, daytime stress, activity score, workouts (gym minutes
-- on their own) and meditation sessions. The digest hands the insights model
-- the 30/60-day means for each, bedtime/deep-sleep/stress correlations with
-- mood, and a gym-day-vs-rest mood split. Also folds in the 17 Oct change
-- (body windows b30/b60 read from the stats side, mood.journal_through) whose
-- migration file was lost; this is the full live definition.
create or replace function public.life_digest(p_uid uuid)
returns jsonb language sql security definer set search_path = public
set enable_nestloop = off
as $fn$
with
today as (select current_date d),
-- the last day the bank has actually reported; anything after it is not yet real
settled as (
  select coalesce(max(day), current_date - 4) sd
  from public.ynab_txn where user_id = p_uid and day <= current_date),
-- ---------- journal scores, flattened once ----------
score as (
  select date d, hap::numeric hap, anx::numeric anx
  from public.journal_entries
  where user_id = p_uid and date is not null and hap > 0
),
-- ---------- daily numbers, flattened once ----------
st as (
  select k::date d,
         nullif(v->>'sleep','')::numeric sleep, nullif(v->>'steps','')::numeric steps,
         nullif(v->>'rhr','')::numeric rhr,     nullif(v->>'weight','')::numeric weight,
         nullif(v->>'hrv','')::numeric hrv,     nullif(v->>'readiness','')::numeric readiness,
         nullif(v->>'tdev','')::numeric tdev,
         nullif(v->>'sleepscore','')::numeric sleepscore, nullif(v->>'actscore','')::numeric actscore,
         nullif(v->>'deep','')::numeric deep,   nullif(v->>'rem','')::numeric rem,
         nullif(v->>'effic','')::numeric effic, nullif(v->>'bed','')::numeric bed, nullif(v->>'wake','')::numeric wake,
         nullif(v->>'stress','')::numeric stress,
         nullif(v->>'workout','')::numeric workout, nullif(v->>'gym','')::numeric gym, nullif(v->>'meditate','')::numeric meditate,
         nullif(v->>'spend','')::numeric spend, (v ? 'away') away
  from public.lifeos_data x, lateral jsonb_each(x.payload->'stats') t(k,v)
  where x.user_id = p_uid and k ~ '^\d{4}-\d{2}-\d{2}$'
),
-- Annalise's cycle, one row per day (Natural Cycles export; phases only)
cyc as (
  select day d, phase, cycle_day, cycle_start, phase_est
  from public.cycle_days where user_id = p_uid and person = 'annalise'
),
cyc_phase as (
  select c.phase,
         count(s.d) n_all,  round(avg(s.hap), 2) hap_all,  round(avg(s.anx), 2) anx_all,
         count(s.d) filter (where s.d > current_date - 365) n_1y,
         round(avg(s.hap) filter (where s.d > current_date - 365), 2) hap_1y,
         round(avg(s.anx) filter (where s.d > current_date - 365), 2) anx_1y
  from cyc c join score s on s.d = c.d
  where c.phase in ('menstrual','follicular','ovulatory','luteal')
  group by c.phase
),
-- one row per working day, from the firm's daily report
work_day as (
  select period_end d,
         nullif(metrics->>'hours','')::numeric hours,
         nullif(metrics->>'billable_hours','')::numeric billable,
         nullif(metrics->>'billed','')::numeric billed
  from public.biz_report where user_id = p_uid and kind = 'daily'
),
joined as (
  select s.d, s.hap, s.anx, st.sleep, st.steps, st.rhr, st.spend, st.hrv, st.readiness, st.tdev,
         st.deep, st.rem, st.effic, st.bed, st.stress, st.workout, st.gym, st.meditate,
         w.hours, w.billable, w.billed,
         coalesce(st.away,false) away, extract(dow from s.d) in (0,6) weekend
  from score s left join st on st.d = s.d left join work_day w on w.d = s.d
),
-- ---------- money ----------
mtd as (
  select bucket, sum(amt) amt from public.ynab_txn
  where user_id = p_uid and day >= date_trunc('month', current_date)
    and day <= (select sd from settled)
    and bucket not in ('income','invested','wash','business','tax')
  group by 1),
sofar as (   -- the same slice of the month across the previous twelve
  select bucket, sum(amt)/12 amt from public.ynab_txn
  where user_id = p_uid
    and day >= date_trunc('month', current_date) - interval '12 months'
    and day <  date_trunc('month', current_date)
    and extract(day from day) <= extract(day from (select sd from settled))
    and bucket not in ('income','invested','wash','business','tax')
  group by 1),
big as (
  select payee, cat, round(sum(amt)) amt from public.ynab_txn
  where user_id = p_uid and day >= date_trunc('month', current_date)
    and day <= (select sd from settled)
    and bucket not in ('income','invested','wash')
  group by 1,2 order by 3 desc limit 8),
-- a clean trailing week that has fully reported, and the same week a year of them ago
week7 as (
  select round(sum(amt)) amt from public.ynab_txn
  where user_id = p_uid and day > (select sd from settled) - 7 and day <= (select sd from settled)
    and bucket not in ('income','invested','wash','business','tax')),
week7_typ as (
  select round(sum(amt)/52.0) amt from public.ynab_txn
  where user_id = p_uid and day > (select sd from settled) - 371 and day <= (select sd from settled) - 7
    and bucket not in ('income','invested','wash','business','tax')),
mon12 as (
  select to_char(day,'YYYY-MM') m,
         round(sum(amt) filter (where bucket = 'day')) day_spend,
         round(sum(amt) filter (where bucket not in ('income','invested','wash','business'))) all_spend,
         round(-sum(amt) filter (where bucket = 'income')) income
  from public.ynab_txn
  where user_id = p_uid and day >= date_trunc('month', current_date) - interval '13 months'
  group by 1 order by 1),
-- ---------- windows ----------
w30 as (select * from joined where d > current_date - 30),
-- body windows over every day with a reading, journal or not: a frozen journal
-- must not make the ring look thin
b30 as (select * from st where d > current_date - 30 and d <= current_date),
b60 as (select * from st where d <= current_date - 30 and d > current_date - 60),
w90 as (select * from joined where d > current_date - 90),
prev30 as (select * from joined where d <= current_date - 30 and d > current_date - 60),
yr as (select * from joined where d > current_date - 365),
-- ---------- the joins worth knowing ----------
corrs as (
  select
    (select round(corr(spend, hap)::numeric, 3) from yr where spend is not null) spend_hap_1y,
    (select round(corr(sleep, anx)::numeric, 3) from joined where sleep is not null) sleep_anx_all,
    (select round(corr(steps, hap)::numeric, 3) from yr where steps is not null) steps_hap_1y,
    (select round(corr(sleep, hap)::numeric, 3) from joined where sleep is not null) sleep_hap_all,
    (select round(corr(hrv, anx)::numeric, 3) from joined where hrv is not null) hrv_anx,
    (select round(corr(hrv, hap)::numeric, 3) from joined where hrv is not null) hrv_hap,
    (select round(corr(readiness, hap)::numeric, 3) from joined where readiness is not null) readiness_hap,
    (select count(*) from joined where hrv is not null) hrv_days,
    (select round(corr(hours, hap)::numeric, 3) from joined where hours is not null) hours_hap,
    (select round(corr(hours, anx)::numeric, 3) from joined where hours is not null) hours_anx,
    (select round(corr(billed, hap)::numeric, 3) from joined where billed is not null) billed_hap,
    (select count(*) from joined where hours is not null) hours_days,
    -- the night before, in more detail than hours: bedtime (hours from midnight,
    -- negative is before), deep sleep minutes, and the day's high-stress minutes
    (select round(corr(bed, hap)::numeric, 3) from joined where bed is not null) bedtime_hap,
    (select round(corr(bed, anx)::numeric, 3) from joined where bed is not null) bedtime_anx,
    (select round(corr(deep, hap)::numeric, 3) from joined where deep is not null) deep_hap,
    (select round(corr(stress, anx)::numeric, 3) from joined where stress is not null) stress_anx,
    (select count(*) from joined where bed is not null) bedtime_days
),
-- a gym day against the rest: the only sure way to know if the goal is worth it
gym_split as (
  select round(avg(hap) filter (where gym > 0), 2) hap_gym,
         round(avg(hap) filter (where gym is null or gym = 0), 2) hap_rest,
         round(avg(anx) filter (where gym > 0), 2) anx_gym,
         round(avg(anx) filter (where gym is null or gym = 0), 2) anx_rest,
         count(*) filter (where gym > 0) n_gym,
         count(*) filter (where workout is not null) n_tracked
  from joined where d > current_date - 365
),
-- a long day is not the same kind of day; ten hours is the line
long_day as (
  select round(avg(hap) filter (where hours >= 10), 2) hap_long,
         round(avg(hap) filter (where hours < 10), 2) hap_normal,
         round(avg(anx) filter (where hours >= 10), 2) anx_long,
         round(avg(anx) filter (where hours < 10), 2) anx_normal,
         count(*) filter (where hours >= 10) n_long,
         count(*) filter (where hours < 10) n_normal
  from joined where hours is not null
),
away_split as (
  select round(avg(hap) filter (where away), 2) hap_away,
         round(avg(hap) filter (where not away), 2) hap_home,
         round(avg(anx) filter (where away), 2) anx_away,
         round(avg(anx) filter (where not away), 2) anx_home,
         count(*) filter (where away) n_away, count(*) filter (where not away) n_home
  from joined where d > current_date - 365
),
trips_now as (
  select jsonb_agg(jsonb_build_object('title', title, 'city', city,
           'start', start_day, 'end', end_day) order by start_day)
  filter (where end_day >= current_date) as upcoming
  from public.trips where user_id = p_uid and start_day <= current_date + 120
)
select jsonb_build_object(
  'as_of', (select d from today),
  'money', jsonb_build_object(
     'month_to_date', (select jsonb_object_agg(bucket, round(amt)) from mtd),
     'typical_same_window', (select jsonb_object_agg(bucket, round(amt)) from sofar),
     'mtd_total', (select round(coalesce(sum(amt),0)) from mtd),
     'typical_total', (select round(coalesce(sum(amt),0)) from sofar),
     'settled_through', (select sd from settled),
     'days_still_posting', (select current_date - sd from settled),
     'last_settled_week', (select amt from week7),
     'typical_week', (select amt from week7_typ),
     'biggest_this_month', (select jsonb_agg(jsonb_build_object('payee',payee,'cat',cat,'amt',amt)) from big),
     'by_month', (select jsonb_agg(jsonb_build_object('m',m,'day',day_spend,'all',all_spend,'income',income)) from mon12)),
  'mood', jsonb_build_object(
     'last30', (select jsonb_build_object('hap', round(avg(hap),2), 'anx', round(avg(anx),2), 'n', count(*)) from w30),
     'prev30', (select jsonb_build_object('hap', round(avg(hap),2), 'anx', round(avg(anx),2), 'n', count(*)) from prev30),
     'last365', (select jsonb_build_object('hap', round(avg(hap),2), 'anx', round(avg(anx),2), 'n', count(*)) from yr),
     'all_time', (select jsonb_build_object('hap', round(avg(hap),2), 'anx', round(avg(anx),2), 'n', count(*)) from joined),
     'journal_through', (select max(d) from score)),
  'body', jsonb_build_object(
     'last30', (select jsonb_build_object('sleep', round(avg(sleep),2), 'steps', round(avg(steps)),
                  'rhr', round(avg(rhr),1), 'nights', count(sleep), 'hrv', round(avg(hrv)), 'readiness', round(avg(readiness)),
                  'temp_dev', round(avg(tdev),2), 'ring_nights', count(hrv),
                  'sleep_score', round(avg(sleepscore)), 'deep_min', round(avg(deep)), 'rem_min', round(avg(rem)),
                  'efficiency', round(avg(effic)), 'bedtime', round(avg(bed),2), 'wake', round(avg(wake),2),
                  'stress_min', round(avg(stress)), 'activity_score', round(avg(actscore)),
                  'workout_days', count(workout), 'workout_min', round(coalesce(sum(workout),0)),
                  'gym_days', count(gym), 'meditate_days', count(meditate)) from b30),
     'prev30', (select jsonb_build_object('sleep', round(avg(sleep),2), 'steps', round(avg(steps)),
                  'rhr', round(avg(rhr),1), 'nights', count(sleep), 'hrv', round(avg(hrv)), 'readiness', round(avg(readiness)),
                  'temp_dev', round(avg(tdev),2), 'ring_nights', count(hrv),
                  'sleep_score', round(avg(sleepscore)), 'deep_min', round(avg(deep)), 'rem_min', round(avg(rem)),
                  'efficiency', round(avg(effic)), 'bedtime', round(avg(bed),2), 'wake', round(avg(wake),2),
                  'stress_min', round(avg(stress)), 'activity_score', round(avg(actscore)),
                  'workout_days', count(workout), 'workout_min', round(coalesce(sum(workout),0)),
                  'gym_days', count(gym), 'meditate_days', count(meditate)) from b60),
     'bedtime_note', 'bedtime and wake are hours from midnight: -0.5 is 11:30pm, 6.75 is 6:45am',
     'gym_vs_rest_365', (select to_jsonb(g) from gym_split g),
     'weight_now', (select weight from st where weight is not null order by d desc limit 1),
     'weight_90d_ago', (select weight from st where weight is not null and d <= current_date - 90 order by d desc limit 1)),
  'travel', jsonb_build_object(
     'away_days_365', (select count(*) filter (where away) from yr),
     'mood_away_vs_home', (select to_jsonb(a) from away_split a),
     'trips', (select upcoming from trips_now)),
  -- Three cadences do three different jobs: the daily carries the freshest
  -- hours, the weekly carries the narrative, the monthly carries the year-to-date
  -- figures the household ledger cannot see. Picking one "latest" row buries two.
  'work', jsonb_build_object(
     'latest', (select jsonb_build_object('kind', kind, 'period_end', period_end, 'metrics', metrics)
                from public.biz_report where user_id = p_uid order by period_end desc, at desc limit 1),
     'week',   (select jsonb_build_object('period', period_start || ' to ' || period_end,
                  'metrics', metrics, 'narrative', left(coalesce(narrative,''), 1500))
                from public.biz_report where user_id = p_uid and kind = 'weekly'
                order by period_end desc limit 1),
     'ytd',    (select jsonb_build_object('through', period_end, 'metrics', metrics)
                from public.biz_report where user_id = p_uid and kind = 'monthly'
                order by period_end desc limit 1),
     'last_narrative', (select left(coalesce(narrative,''), 1500) from public.biz_report
                where user_id = p_uid and coalesce(narrative,'') <> '' order by period_end desc limit 1),
     'days', (select jsonb_agg(jsonb_build_object('d', period_end,
                'hours', metrics->'hours', 'billable', metrics->'billable_hours', 'billed', metrics->'billed')
                order by period_end desc)
              from (select * from public.biz_report where user_id = p_uid and kind = 'daily'
                    order by period_end desc limit 30) z)),
  'links', (select to_jsonb(c) from corrs c),
  -- his scores by where Annalise is in her cycle. Tracked since 2017 (gaps in
  -- pregnancies and postpartum). Phase differences to date are ~0.1-0.2 points.
  'cycle', jsonb_build_object(
     'today', public.cycle_today(p_uid),
     'by_phase', (select jsonb_object_agg(phase, jsonb_build_object(
                  'n', n_all, 'hap', hap_all, 'anx', anx_all,
                  'n_1y', n_1y, 'hap_1y', hap_1y, 'anx_1y', anx_1y)) from cyc_phase)),
  'long_days', (select to_jsonb(l) from long_day l),
  'weekend', (select jsonb_build_object(
     'hap_weekend', round(avg(hap) filter (where weekend),2),
     'hap_weekday', round(avg(hap) filter (where not weekend),2),
     'spend_weekend', round(avg(spend) filter (where weekend)),
     'spend_weekday', round(avg(spend) filter (where not weekend))) from yr)
);
$fn$;

grant execute on function public.life_digest(uuid) to service_role;

-- the connection remembers which scopes it was granted, so the app can say
-- "reconnect for workouts" to a ring connected before 31 Oct
alter table public.oura_auth add column if not exists scope text;
create or replace function public.oura_status()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce((select jsonb_build_object('connected', true, 'email', email, 'connected_at', connected_at,
                     'last_sync', last_sync, 'last_error', last_error, 'synced_through', synced_through,
                     'scope', coalesce(scope, 'email daily heartrate spo2'))
                   from public.oura_auth where user_id = auth.uid()),
                  jsonb_build_object('connected', false));
$fn$;
revoke all on function public.oura_status() from public, anon;
grant execute on function public.oura_status() to authenticated, service_role;
