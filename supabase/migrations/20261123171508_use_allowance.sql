-- M3-B3: use_allowance(user_id, type) → AllowanceResult, for content without AI: curated
-- Reading/Listening tests, practice sessions, mock tests (plans.limits counts).
--
-- Period: the calendar month in UTC (period_start = the 1st). Paid plans may move to their
-- billing period in M9; the period is computed in one place (allowance_period_start) for that.
-- Counting is atomic: the user's row for the period is locked FOR UPDATE before the check.
-- Service role only (Edge Functions start the test, then call this).

create function public.allowance_period_start()
returns date
language sql
stable
set search_path = ''
as $$
  select pg_catalog.date_trunc('month', now() at time zone 'UTC')::date;
$$;

comment on function public.allowance_period_start() is
  'Current allowance period start: 1st of the month, UTC (M3-B3).';

create function public.use_allowance(p_user_id uuid, p_type text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_period date := public.allowance_period_start();
  v_limit integer;
  v_used integer;
begin
  if p_type is null or p_type not in ('reading_tests', 'listening_tests', 'practice_sessions', 'mock_tests') then
    raise exception 'unknown allowance type: %', p_type using errcode = '22023';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'unknown user' using errcode = '22023';
  end if;

  v_limit := coalesce((public.user_plan_limits(p_user_id) ->> p_type)::integer, 0);

  insert into public.usage_allowance (user_id, period_start) values (p_user_id, v_period)
  on conflict (user_id, period_start) do nothing;

  select case p_type
           when 'reading_tests' then a.reading_tests_used
           when 'listening_tests' then a.listening_tests_used
           when 'practice_sessions' then a.practice_sessions_used
           when 'mock_tests' then a.mock_tests_used
         end
  into v_used
  from public.usage_allowance a
  where a.user_id = p_user_id and a.period_start = v_period
  for update;

  if v_used >= v_limit then
    return jsonb_build_object('ok', false, 'code', 'allowance_exceeded', 'type', p_type, 'used', v_used, 'limit', v_limit);
  end if;

  update public.usage_allowance a set
    reading_tests_used = a.reading_tests_used + (p_type = 'reading_tests')::int,
    listening_tests_used = a.listening_tests_used + (p_type = 'listening_tests')::int,
    practice_sessions_used = a.practice_sessions_used + (p_type = 'practice_sessions')::int,
    mock_tests_used = a.mock_tests_used + (p_type = 'mock_tests')::int
  where a.user_id = p_user_id and a.period_start = v_period;

  return jsonb_build_object('ok', true, 'type', p_type, 'used', v_used + 1, 'limit', v_limit);
end;
$$;

comment on function public.use_allowance(uuid, text) is
  'Counts one use of a monthly allowance (M3-B3); allowance_exceeded when the plan''s limit is reached. Service role only.';

revoke all on function public.allowance_period_start() from public, anon, authenticated;
revoke all on function public.use_allowance(uuid, text) from public, anon, authenticated;
grant execute on function public.use_allowance(uuid, text) to service_role;
