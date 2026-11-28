-- Support fix (M9-A1): "Free" in the admin Change plan dialog also ends exam packs. They were
-- paid once, so ending one stops nothing at Razorpay / Paddle; before, a student on a pack
-- stayed on its plan. Monthly provider subscriptions are still left alone (cancel those at the
-- provider so the charges stop). Refunding the pack, if any, is done in the provider's dashboard.
-- The rest of admin_set_manual_plan is unchanged from 20261208090000_admin_billing.sql.

create or replace function public.admin_set_manual_plan(
  p_user_id uuid,
  p_plan public.plan_tier,
  p_days integer,
  p_grant_credits boolean,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_before public.plan_tier;
  v_after public.plan_tier;
  v_sub uuid;
  v_until timestamptz;
  v_credits integer := 0;
  v_ended integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  v_note := public.admin_note(p_note);
  if p_plan is null then
    raise exception 'choose a plan' using errcode = '22023';
  end if;
  if p_plan <> 'free' and (p_days is null or p_days < 1 or p_days > 366) then
    raise exception 'the plan must last 1 to 366 days' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('prepora.billing:' || p_user_id::text, 0));
  select plan into v_before from public.profiles where id = p_user_id;

  -- A new manual plan replaces any earlier one; 'free' just ends them.
  update public.subscriptions
  set status = 'cancelled', cancelled_at = now(),
      current_period_end = least(current_period_end, greatest(now(), current_period_start + interval '1 second'))
  where user_id = p_user_id and status in ('active', 'past_due')
    -- Manual plans always; exam packs only when ending the paid plan (they were paid once, so
    -- nothing is charged again). Monthly provider subscriptions are cancelled at the provider.
    and (provider = 'manual' or (p_plan = 'free' and kind = 'exam_pack'));
  get diagnostics v_ended = row_count;

  if p_plan <> 'free' then
    v_until := now() + make_interval(days => p_days);
    insert into public.subscriptions (user_id, plan_id, kind, provider, status, current_period_start,
      current_period_end, cancel_at_period_end)
    values (p_user_id, p_plan, 'subscription', 'manual', 'active', now(), v_until, true)
    returning id into v_sub;
    if p_grant_credits then
      v_credits := coalesce(((select limits from public.plans where id = p_plan) ->> 'monthly_credits')::integer, 0);
      perform public.billing_grant('manual:' || v_sub, p_user_id, v_sub, 'period', 'admin', v_credits,
        least(v_until, now() + interval '1 month'), null, 'manual', null, null, null);
    end if;
  end if;

  v_after := public.billing_sync_profile(p_user_id);
  perform public.write_audit('plan.manual_change', 'user', p_user_id::text, jsonb_build_object(
    'plan', p_plan, 'until', v_until, 'credits', v_credits, 'ended_manual', v_ended,
    'plan_before', v_before, 'plan_after', v_after, 'note', v_note));

  return jsonb_build_object('ok', true, 'subscription_id', v_sub, 'until', v_until, 'credits', v_credits,
    'plan_before', v_before, 'plan_after', v_after);
end;
$$;
