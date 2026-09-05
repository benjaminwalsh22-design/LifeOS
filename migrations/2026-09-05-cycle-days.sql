create table if not exists public.cycle_days (
  user_id      uuid not null,
  day          date not null,
  person       text not null default 'annalise',
  cycle_no     int,
  cycle_day    int,
  cycle_start  date,
  phase        text,            -- menstrual | follicular | ovulatory | luteal | pregnant | unknown
  menstruation boolean not null default false,
  ovulation    boolean not null default false,   -- the confirmed ovulation day
  goal         text,            -- prevent | plan | pregnant
  phase_est    boolean not null default false,   -- ovulation not confirmed; phase from average luteal length
  source       text not null default 'natural_cycles',
  primary key (user_id, person, day)
);
alter table public.cycle_days enable row level security;
drop policy if exists cycle_days_own on public.cycle_days;
create policy cycle_days_own on public.cycle_days for select using (user_id = auth.uid());
grant select on public.cycle_days to authenticated;
grant select, insert, update, delete on public.cycle_days to service_role;
