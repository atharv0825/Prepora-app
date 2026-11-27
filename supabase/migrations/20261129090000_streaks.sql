-- Practice streaks (plan Phase 9: "Streaks, daily goals…"; the streak part).
--
-- get_my_streak() → Streak (packages/shared/src/api/streak.ts) for the home dashboard.
--
-- A practice day is a calendar day, in the student's own time zone (profiles.timezone, else
-- UTC), on which they finished at least one scored piece of practice: a Reading or Listening
-- test (test_attempts), a Writing answer (writing_submissions) or a Speaking part
-- (speaking_responses). Nothing new is stored: the days come from those tables, so the streak
-- can never drift from the history, and deleting a test or changing time zone just recounts.
--
-- The current streak is the run of consecutive practice days ending today, or ending yesterday
-- if the student hasn't practised yet today (the streak is still alive until today ends).
-- Longest is the longest run ever; total_days counts every practice day ever. `recent` lists the
-- practice days among the last p_days (default 7: the week strip on the dashboard card; the
-- profile asks for 84, a 12-week calendar). p_days must be 1–120.
--
-- Takes no user id: it always answers for auth.uid(). SECURITY DEFINER only so it reads the
-- three tables in one pass without depending on their RLS policies; it filters by auth.uid().

create function public.get_my_streak(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tz text;
  v_today date;
  v_current integer;
  v_longest integer;
  v_total integer;
  v_recent jsonb;
begin
  if v_user is null then
    raise exception 'sign in to see your streak' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 120 then
    raise exception 'p_days must be between 1 and 120' using errcode = '22023';
  end if;

  -- profiles.timezone is checked against pg_timezone_names when saved, so it's always valid.
  v_tz := coalesce((select p.timezone from public.profiles p where p.id = v_user), 'UTC');
  v_today := (now() at time zone v_tz)::date;

  with done as (
    select a.created_at from public.test_attempts a where a.user_id = v_user
    union all
    select w.created_at from public.writing_submissions w where w.user_id = v_user
    union all
    select s.created_at from public.speaking_responses s where s.user_id = v_user
  ),
  days as (
    select distinct (d.created_at at time zone v_tz)::date as day from done d
  ),
  -- Gaps and islands: consecutive days share day − row_number().
  islands as (
    select max(day) as last_day, count(*)::integer as length
    from (select day, day - (row_number() over (order by day))::integer as grp from days) r
    group by grp
  )
  select
    coalesce(max(i.length) filter (where i.last_day >= v_today - 1), 0),
    coalesce(max(i.length), 0),
    coalesce(sum(i.length), 0)::integer,
    coalesce((select jsonb_agg(to_char(d.day, 'YYYY-MM-DD') order by d.day)
              from days d where d.day between v_today - (p_days - 1) and v_today), '[]'::jsonb)
  into v_current, v_longest, v_total, v_recent
  from islands i;

  return jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'current', v_current,
    'longest', v_longest,
    'total_days', v_total,
    'practised_today', v_recent ? to_char(v_today, 'YYYY-MM-DD'),
    'recent', v_recent
  );
end;
$$;

comment on function public.get_my_streak(integer) is
  'The caller''s practice streak: current and longest runs of days (own time zone) with a scored Reading/Listening test, Writing answer or Speaking part, total practice days, and the practice days among the last p_days (1–120, default 7). Streak JSON.';

revoke all on function public.get_my_streak(integer) from public, anon;
grant execute on function public.get_my_streak(integer) to authenticated;
