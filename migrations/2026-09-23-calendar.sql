-- Calendar: events pulled from private iCal feeds by cal-tick, one row per
-- occurrence (recurring events expanded). Titles are stored, but whether they
-- reach a model is decided per feed (the `titles` flag in CAL_FEEDS).
create table if not exists public.cal_events (
  user_id    uuid not null,
  cal        text not null,               -- feed name
  uid        text not null,               -- iCal UID + occurrence start
  day        date not null,
  start_at   timestamptz,
  end_at     timestamptz,
  all_day    boolean not null default false,
  title      text,
  location   text,
  status     text,                        -- CONFIRMED / TENTATIVE / CANCELLED
  mine       text,                        -- my PARTSTAT if listed: ACCEPTED / DECLINED / TENTATIVE / NEEDS-ACTION
  attendees  int,
  share_title boolean not null default false,
  primary key (user_id, cal, uid)
);
create index if not exists cal_events_day on public.cal_events (user_id, day);
alter table public.cal_events enable row level security;
revoke all on public.cal_events from anon, authenticated;
grant select, insert, update, delete on public.cal_events to service_role;

-- per-day picture for the app: counts and hours always; titles only where the feed allows
create or replace function public.cal_days(p_uid uuid, from_day date, to_day date)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day, 'n', d.n, 'hours', d.hours, 'first', d.first_at, 'last', d.last_at,
      'allday', d.allday, 'titles', d.titles) order by d.day), '[]'::jsonb)
  from (
    select day,
      count(*) filter (where not all_day and coalesce(status,'') <> 'CANCELLED' and coalesce(mine,'') <> 'DECLINED') n,
      round(coalesce(sum(extract(epoch from (end_at - start_at))/3600) filter (where not all_day and coalesce(status,'') <> 'CANCELLED' and coalesce(mine,'') <> 'DECLINED'), 0)::numeric, 2) hours,
      to_char(min(start_at) filter (where not all_day) at time zone 'America/Los_Angeles', 'HH24:MI') first_at,
      to_char(max(end_at) filter (where not all_day) at time zone 'America/Los_Angeles', 'HH24:MI') last_at,
      coalesce(jsonb_agg(title) filter (where all_day and share_title and title is not null), '[]'::jsonb) allday,
      coalesce(jsonb_agg(title order by start_at) filter (where not all_day and share_title and title is not null and coalesce(status,'') <> 'CANCELLED' and coalesce(mine,'') <> 'DECLINED'), '[]'::jsonb) titles
    from public.cal_events
    where user_id = p_uid and day between from_day and to_day
    group by day) d;
$fn$;
revoke all on function public.cal_days(uuid, date, date) from public, anon, authenticated;
grant execute on function public.cal_days(uuid, date, date) to service_role;

create or replace function public.my_cal_days(from_day date, to_day date)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select public.cal_days(auth.uid(), from_day, to_day);
$fn$;
revoke all on function public.my_cal_days(date, date) from public, anon;
grant execute on function public.my_cal_days(date, date) to authenticated, service_role;
