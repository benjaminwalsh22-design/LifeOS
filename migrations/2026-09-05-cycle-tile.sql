-- The "period started" tile. Between Natural Cycles exports, a tap projects the
-- new cycle forward (45 days, phase_est, source 'manual') so today's phase stays
-- current for the digest. The next export overwrites the projection with the
-- real days; the loader's upsert sets source back to natural_cycles.

create or replace function public.cycle_today(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  -- the latest known day; when it is behind today, project the cycle day forward
  -- from the cycle start and estimate the phase from her averages
  select jsonb_build_object(
    'data_through', x.day,
    'cycle_start', x.cycle_start,
    'source', x.source,
    'cycle_day', case when x.day = current_date then x.cycle_day else current_date - x.cycle_start + 1 end,
    'phase', case when x.day = current_date then x.phase
                  else (select case when d <= 5 then 'menstrual' when d <= 13 then 'follicular' when d <= 16 then 'ovulatory' when d <= 45 then 'luteal' else 'unknown' end
                        from (select current_date - x.cycle_start + 1 d) z) end,
    'phase_est', case when x.day = current_date then x.phase_est else true end)
  from (
    select day, phase, cycle_day, cycle_start, phase_est, source
    from public.cycle_days
    where user_id = p_uid and person = 'annalise' and day <= current_date and cycle_start is not null
    order by day desc limit 1) x;
$fn$;
grant execute on function public.cycle_today(uuid) to service_role;

create or replace function public.my_cycle_today()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select public.cycle_today(auth.uid());
$fn$;
grant execute on function public.my_cycle_today() to authenticated;

-- Averages from her own history (Fertility.csv): cycle 27.1 days, period 5.5,
-- ovulation day 15.0, luteal 11.0. Days 1-5 menstrual, 14-16 ovulatory.
create or replace function public.cycle_start(p_uid uuid, p_day date)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if p_day > current_date or p_day < current_date - 60 then
    raise exception 'day must be within the last 60 days';
  end if;
  delete from public.cycle_days where user_id = p_uid and person = 'annalise' and source = 'manual' and day >= p_day;
  select coalesce(max(cycle_no), 0) + 1 into n from public.cycle_days where user_id = p_uid and person = 'annalise';
  insert into public.cycle_days (user_id, day, cycle_no, cycle_day, cycle_start, phase, menstruation, ovulation, goal, phase_est, source)
  select p_uid, p_day + i, n, i + 1, p_day,
         case when i < 5 then 'menstrual' when i < 13 then 'follicular' when i <= 15 then 'ovulatory' else 'luteal' end,
         i < 5, false, 'prevent', true, 'manual'
  from generate_series(0, 44) i
  on conflict (user_id, person, day) do update
     set cycle_no = excluded.cycle_no, cycle_day = excluded.cycle_day, cycle_start = excluded.cycle_start,
         phase = excluded.phase, menstruation = excluded.menstruation, ovulation = false,
         goal = excluded.goal, phase_est = true, source = 'manual';
  return public.cycle_today(p_uid);
end $fn$;
grant execute on function public.cycle_start(uuid, date) to service_role;

create or replace function public.my_cycle_start(p_day date)
returns jsonb language sql security definer set search_path = public as $fn$
  select public.cycle_start(auth.uid(), p_day);
$fn$;
grant execute on function public.my_cycle_start(date) to authenticated;

-- a mis-tap: drop the most recent manual projection
create or replace function public.my_cycle_undo()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare last_start date;
begin
  select max(cycle_start) into last_start from public.cycle_days
   where user_id = auth.uid() and person = 'annalise' and source = 'manual';
  if last_start is not null then
    delete from public.cycle_days where user_id = auth.uid() and person = 'annalise' and source = 'manual' and cycle_start = last_start;
  end if;
  return public.cycle_today(auth.uid());
end $fn$;
grant execute on function public.my_cycle_undo() to authenticated;
