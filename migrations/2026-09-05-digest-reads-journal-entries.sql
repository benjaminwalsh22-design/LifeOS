-- One compact picture of the joined data: money, mood, body, travel.
-- Small enough to hand to a model, complete enough to reason from, and it never
-- exposes a journal entry — only counts, means and correlations.
create or replace function public.life_digest(p_uid uuid)
returns jsonb language sql security definer set search_path = public
-- the stats side is a jsonb expansion the planner sizes at one row, so it nests a
-- 3,500-row scan inside a 4,000-row loop; a hash join runs the same thing in ~1 s
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
         nullif(v->>'spend','')::numeric spend, (v ? 'away') away
  from public.lifeos_data x, lateral jsonb_each(x.payload->'stats') t(k,v)
  where x.user_id = p_uid and k ~ '^\d{4}-\d{2}-\d{2}$'
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
  select s.d, s.hap, s.anx, st.sleep, st.steps, st.rhr, st.spend,
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
    (select round(corr(hours, hap)::numeric, 3) from joined where hours is not null) hours_hap,
    (select round(corr(hours, anx)::numeric, 3) from joined where hours is not null) hours_anx,
    (select round(corr(billed, hap)::numeric, 3) from joined where billed is not null) billed_hap,
    (select count(*) from joined where hours is not null) hours_days
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
     'all_time', (select jsonb_build_object('hap', round(avg(hap),2), 'anx', round(avg(anx),2), 'n', count(*)) from joined)),
  'body', jsonb_build_object(
     'last30', (select jsonb_build_object('sleep', round(avg(sleep),2), 'steps', round(avg(steps)),
                  'rhr', round(avg(rhr),1), 'nights', count(sleep)) from w30),
     'prev30', (select jsonb_build_object('sleep', round(avg(sleep),2), 'steps', round(avg(steps)),
                  'rhr', round(avg(rhr),1), 'nights', count(sleep)) from prev30),
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
  'long_days', (select to_jsonb(l) from long_day l),
  'weekend', (select jsonb_build_object(
     'hap_weekend', round(avg(hap) filter (where weekend),2),
     'hap_weekday', round(avg(hap) filter (where not weekend),2),
     'spend_weekend', round(avg(spend) filter (where weekend)),
     'spend_weekday', round(avg(spend) filter (where not weekend))) from yr)
);
$fn$;
grant execute on function public.life_digest(uuid) to service_role;

create or replace function public.my_digest()
returns jsonb language sql security definer set search_path = public as $fn$
  select public.life_digest(auth.uid());
$fn$;
grant execute on function public.my_digest() to authenticated;
