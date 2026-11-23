-- M3-B1: spend_credits(user_id, action_key, ref_id) → SpendResult (packages/shared/src/api/credits.ts).
--
-- Called by Edge Functions (service role) before an AI call; never by the browser: it takes a
-- user id, so EXECUTE is granted to service_role only.
--
-- Order of checks: action exists → plan has the feature → enough credits → daily cap. Refusals
-- are returned as JSON ({ ok: false, code, … }), not raised, so the Edge helper (M3-B6) maps them
-- to HTTP 402/429/403. Unknown actions and missing users are programming errors and do raise.
--
-- Concurrency: a per-user transaction lock serialises this user's credit operations (spend,
-- refund, grants), so two parallel spends can't both pass the balance or cap check; buckets are
-- also locked FOR UPDATE while they're debited.

-- Shared by the credit functions: one lock key per user.
create function public.lock_user_credits(p_user_id uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('prepora.credits:' || p_user_id::text, 0));
$$;

comment on function public.lock_user_credits(uuid) is
  'Transaction-scoped lock on one user''s credits (M3-B1). Held until commit/rollback.';

-- Start of "today" for the daily cap: midnight UTC (creditErrorMessages says so).
create function public.credit_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select pg_catalog.date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
$$;

-- Credits spent today and not refunded.
create function public.credits_spent_today(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(-sum(l.delta), 0)::integer
  from public.credit_ledger l
  where l.user_id = p_user_id
    and l.reason = 'spend'
    and l.created_at >= public.credit_day_start()
    and not exists (
      select 1 from public.credit_ledger r
      where r.reservation_id = l.reservation_id and r.reason = 'refund'
    );
$$;

-- Spendable balance: remaining credits in unexpired buckets (expiry is enforced here even
-- before the expiry job zeroes a bucket).
create function public.credit_balance(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(b.remaining), 0)::integer
  from public.credit_buckets b
  where b.user_id = p_user_id
    and b.remaining > 0
    and (b.expires_at is null or b.expires_at > now());
$$;

-- The user's plan limits (profiles.plan; Free when there's no profile row yet, M1-B2).
create function public.user_plan_limits(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pl.limits
  from public.plans pl
  where pl.id = coalesce((select p.plan from public.profiles p where p.id = p_user_id), 'free');
$$;

create function public.spend_credits(p_user_id uuid, p_action_key text, p_ref_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cost integer;
  v_feature text;
  v_limits jsonb;
  v_balance integer;
  v_cap integer;
  v_spent integer;
  v_need integer;
  v_take integer;
  v_reservation uuid := gen_random_uuid();
  v_bucket record;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'unknown user' using errcode = '22023';
  end if;

  select c.credits, c.required_feature into v_cost, v_feature
  from public.credit_costs c
  where c.action_key = p_action_key and c.is_active;
  if not found then
    raise exception 'unknown or inactive action: %', p_action_key using errcode = '22023';
  end if;

  perform public.lock_user_credits(p_user_id);

  v_limits := public.user_plan_limits(p_user_id);

  -- 1. Feature flag (OCR, AI generation, natural voice).
  if v_feature is not null and not coalesce((v_limits ->> v_feature)::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'feature_not_in_plan',
      'action_key', p_action_key, 'credits', v_cost, 'feature', v_feature);
  end if;

  v_balance := public.credit_balance(p_user_id);
  v_spent := public.credits_spent_today(p_user_id);
  v_cap := coalesce((v_limits ->> 'daily_credit_cap')::integer, 0);

  -- 2. Enough credits? (Checked before the cap: waiting until tomorrow wouldn't help.)
  if v_balance < v_cost then
    return jsonb_build_object('ok', false, 'code', 'insufficient_credits',
      'action_key', p_action_key, 'credits', v_cost, 'balance', v_balance);
  end if;

  -- 3. Daily cap (anti-abuse).
  if v_spent + v_cost > v_cap then
    return jsonb_build_object('ok', false, 'code', 'daily_cap_reached',
      'action_key', p_action_key, 'credits', v_cost, 'daily_cap', v_cap, 'spent_today', v_spent);
  end if;

  -- 4. Spend from the bucket that expires first (never-expiring buckets last, oldest first).
  v_need := v_cost;
  for v_bucket in
    select b.id, b.remaining
    from public.credit_buckets b
    where b.user_id = p_user_id
      and b.remaining > 0
      and (b.expires_at is null or b.expires_at > now())
    order by b.expires_at asc nulls last, b.created_at asc, b.id
    for update
  loop
    exit when v_need = 0;
    v_take := least(v_bucket.remaining, v_need);
    update public.credit_buckets set remaining = remaining - v_take where id = v_bucket.id;
    insert into public.credit_ledger (user_id, bucket_id, delta, reason, action_key, ref_id, reservation_id)
    values (p_user_id, v_bucket.id, -v_take, 'spend', p_action_key, p_ref_id, v_reservation);
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    -- Can't happen under the lock (balance was checked); fail loudly rather than overspend.
    raise exception 'credit balance changed during spend' using errcode = '40001';
  end if;

  return jsonb_build_object('ok', true, 'reservation_id', v_reservation,
    'action_key', p_action_key, 'credits', v_cost,
    'balance_after', v_balance - v_cost, 'spent_today', v_spent + v_cost);
end;
$$;

comment on function public.spend_credits(uuid, text, uuid) is
  'Spends an action''s credits for a user (M3-B1): plan feature, balance, daily cap (UTC), soonest-expiring bucket first. '
  'Returns SpendResult JSON with a reservation_id for refund_credits. Service role only.';

-- Service role only (Edge Functions). Supabase grants new functions to anon/authenticated by
-- default, so revoke from them explicitly.
revoke all on function public.lock_user_credits(uuid) from public, anon, authenticated;
revoke all on function public.credit_day_start() from public, anon, authenticated;
revoke all on function public.credits_spent_today(uuid) from public, anon, authenticated;
revoke all on function public.credit_balance(uuid) from public, anon, authenticated;
revoke all on function public.user_plan_limits(uuid) from public, anon, authenticated;
revoke all on function public.spend_credits(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, text, uuid) to service_role;
grant execute on function public.credit_balance(uuid) to service_role;
grant execute on function public.credits_spent_today(uuid) to service_role;
