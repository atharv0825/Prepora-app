-- Home dashboard overview (M8.6): get_my_dashboard() → DashboardStats
-- (packages/shared/src/api/dashboard.ts).
--
-- One call for the dashboard's chart cards, for the caller (auth.uid()) only:
--   modules  per module: how many scored pieces of practice, the latest band and the average of
--            the last 5 bands. Reading and Listening come from test_attempts, Writing from
--            writing_submissions, Speaking from speaking_responses (one row per scored part).
--   days     the last 14 days (oldest first) in the student's time zone (profiles.timezone,
--            else UTC), each with its practice count and average band; the trend card compares
--            this week (last 7) with the week before.
--
-- Nothing new is stored. SECURITY DEFINER only so it reads the three tables in one pass without
-- depending on their RLS policies; every read is filtered by auth.uid().

create function public.get_my_dashboard()
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
  v_modules jsonb;
  v_days jsonb;
begin
  if v_user is null then
    raise exception 'sign in to see your dashboard' using errcode = '42501';
  end if;

  v_tz := coalesce((select p.timezone from public.profiles p where p.id = v_user), 'UTC');
  v_today := (now() at time zone v_tz)::date;

  with done as (
    select a.module::text as module, a.band, a.created_at from public.test_attempts a where a.user_id = v_user
    union all
    select 'writing', w.band, w.created_at from public.writing_submissions w where w.user_id = v_user
    union all
    select 'speaking', s.band, s.created_at from public.speaking_responses s where s.user_id = v_user
  ),
  ranked as (
    select d.*, row_number() over (partition by d.module order by d.created_at desc) as n from done d
  ),
  per_module as (
    select
      m.module,
      m.ord,
      count(r.module)::integer as count,
      max(r.band) filter (where r.n = 1) as latest_band,
      round(avg(r.band) filter (where r.n <= 5), 2) as recent_band
    from unnest(array['reading', 'listening', 'writing', 'speaking']) with ordinality as m(module, ord)
    left join ranked r on r.module = m.module
    group by m.module, m.ord
  ),
  per_day as (
    select g.day::date as day, count(d.created_at)::integer as count, round(avg(d.band), 2) as average_band
    from generate_series(v_today - 13, v_today, interval '1 day') as g(day)
    left join done d on (d.created_at at time zone v_tz)::date = g.day::date
    group by g.day
  )
  select
    (select jsonb_agg(jsonb_build_object(
       'module', pm.module, 'count', pm.count, 'latest_band', pm.latest_band, 'recent_band', pm.recent_band) order by pm.ord)
     from per_module pm),
    (select jsonb_agg(jsonb_build_object(
       'date', to_char(pd.day, 'YYYY-MM-DD'), 'count', pd.count, 'average_band', pd.average_band) order by pd.day)
     from per_day pd)
  into v_modules, v_days;

  return jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'modules', v_modules,
    'days', v_days
  );
end;
$$;

comment on function public.get_my_dashboard() is
  'The caller''s dashboard overview: per module (reading, listening, writing, speaking) the practice count, latest band and average of the last 5 bands; and the last 14 days (own time zone) with practice count and average band. DashboardStats JSON.';

revoke all on function public.get_my_dashboard() from public, anon;
grant execute on function public.get_my_dashboard() to authenticated;
