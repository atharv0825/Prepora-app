-- M3-B5: get_my_credits() → CreditBalance (packages/shared/src/api/credits.ts).
--
-- The signed-in user's own credits in one call, for the header chip and the "Credits & usage"
-- page (M3-F1): plan, spendable balance, unexpired buckets (soonest expiry first), today's spend
-- against the daily cap, and this month's allowances. An RPC rather than an Edge Function:
-- it's one read with the caller's session, no AI and no secrets (plan.md calls it
-- "get-my-credits"; it's /rest/v1/rpc/get_my_credits).
--
-- Takes no user id: it always answers for auth.uid(), so a user can only see their own.
-- SECURITY DEFINER because the helpers it uses (credit_balance, credits_spent_today, …) are
-- service-role only.

create function public.get_my_credits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_plan public.plan_tier;
  v_limits jsonb;
  v_period date := public.allowance_period_start();
  v_usage public.usage_allowance%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to see your credits' using errcode = '42501';
  end if;

  v_plan := coalesce((select p.plan from public.profiles p where p.id = v_user), 'free');
  v_limits := (select pl.limits from public.plans pl where pl.id = v_plan);
  select * into v_usage from public.usage_allowance a where a.user_id = v_user and a.period_start = v_period;

  return jsonb_build_object(
    'plan', v_plan,
    'balance', public.credit_balance(v_user),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'source', b.source, 'granted', b.granted, 'remaining', b.remaining,
               'expires_at', b.expires_at)
             order by b.expires_at asc nulls last, b.created_at, b.id)
      from public.credit_buckets b
      where b.user_id = v_user and b.remaining > 0 and (b.expires_at is null or b.expires_at > now())
    ), '[]'::jsonb),
    'spent_today', public.credits_spent_today(v_user),
    'daily_cap', coalesce((v_limits ->> 'daily_credit_cap')::integer, 0),
    'period_start', v_period,
    'allowances', jsonb_build_array(
      jsonb_build_object('type', 'reading_tests', 'used', coalesce(v_usage.reading_tests_used, 0),
                         'limit', coalesce((v_limits ->> 'reading_tests')::integer, 0)),
      jsonb_build_object('type', 'listening_tests', 'used', coalesce(v_usage.listening_tests_used, 0),
                         'limit', coalesce((v_limits ->> 'listening_tests')::integer, 0)),
      jsonb_build_object('type', 'practice_sessions', 'used', coalesce(v_usage.practice_sessions_used, 0),
                         'limit', coalesce((v_limits ->> 'practice_sessions')::integer, 0)),
      jsonb_build_object('type', 'mock_tests', 'used', coalesce(v_usage.mock_tests_used, 0),
                         'limit', coalesce((v_limits ->> 'mock_tests')::integer, 0))
    )
  );
end;
$$;

comment on function public.get_my_credits() is
  'The caller''s credits (M3-B5): plan, balance, unexpired buckets, spent today vs daily cap, monthly allowances. CreditBalance JSON.';

revoke all on function public.get_my_credits() from public, anon;
grant execute on function public.get_my_credits() to authenticated;
