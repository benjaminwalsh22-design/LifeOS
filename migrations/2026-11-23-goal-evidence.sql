-- Goals v2, step 2: the journal as evidence. goal-tick reads each newly transcribed page for
-- signs of his weekly goals ("gym this morning", "dinner out, just the two of us") and keeps
-- what it finds here, with the sentence it rests on. The app reads it through my_goal_evidence()
-- and counts those days; he can strike any of them on the goal. Nothing is written into the
-- journal or into the goals themselves.
create table if not exists public.goal_evidence (
  user_id    uuid not null references auth.users(id) on delete cascade,
  goal_id    text not null,
  day        date not null,                 -- the day the thing happened
  quote      text,                          -- his words, checked to be on the page
  entry_id   text,                          -- the journal page
  sure       boolean not null default true, -- false: the page left a doubt; shown to him, counted only if he says so
  created_at timestamptz not null default now(),
  primary key (user_id, goal_id, day)
);
-- which version of which page has been read, and for which set of goals
create table if not exists public.goal_pages (
  user_id  uuid not null references auth.users(id) on delete cascade,
  entry_id text not null,
  mt       bigint,
  sig      text,
  read_at  timestamptz not null default now(),
  primary key (user_id, entry_id)
);
alter table public.goal_evidence enable row level security;
alter table public.goal_pages enable row level security;
revoke all on public.goal_evidence, public.goal_pages from anon, authenticated;

create or replace function public.my_goal_evidence()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('g', goal_id, 'd', day, 'q', quote, 'p', entry_id, 's', sure) order by day, goal_id), '[]'::jsonb)
  from public.goal_evidence
  where user_id = auth.uid() and day >= current_date - 200;
$fn$;
revoke all on function public.my_goal_evidence() from public, anon;
grant execute on function public.my_goal_evidence() to authenticated;
