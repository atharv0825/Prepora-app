-- M9-A1: admin billing. Subscriptions list, revenue by currency, one user's subscriptions and a
-- manual plan change for support cases.
--
-- Same pattern as the other admin RPCs (M2-A1, M3-A1/A2): SECURITY DEFINER, raise 42501 unless
-- is_admin(), called by the admin panel with the admin's own session. Changes are audited.
-- Admins only (not content editors): this is students' money.

-- ── 1. Subscriptions list ───────────────────────────────────────────────────────────────────
-- Newest first. p_status filters; p_search matches the email or name (case-insensitive, literal).
create function public.admin_list_subscriptions(
  p_status public.subscription_status default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  plan_id public.plan_tier,
  kind public.price_kind,
  provider public.payment_provider,
  status public.subscription_status,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  scheduled_plan_id public.plan_tier,
  currency char(3),
  amount_minor integer,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pattern text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  v_pattern := case when nullif(btrim(coalesce(p_search, '')), '') is null then null
    else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  return query
  select s.id, s.user_id, u.email::text, p.full_name, s.plan_id, s.kind, s.provider, s.status,
    s.current_period_end, s.cancel_at_period_end, sp.plan_id, s.currency, s.amount_minor, s.created_at,
    count(*) over ()
  from public.subscriptions s
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join public.prices sp on sp.id = s.scheduled_price_id
  where (p_status is null or s.status = p_status)
    and (v_pattern is null or u.email ilike v_pattern or p.full_name ilike v_pattern)
  order by s.created_at desc, s.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.admin_list_subscriptions(public.subscription_status, text, integer, integer) is
  'M9-A1: subscriptions with the student''s email and name, newest first, filtered and paged. Admins only.';

-- ── 2. Revenue by currency ──────────────────────────────────────────────────────────────────
-- From billing_grants (one row per payment; upgrades carry no amount). Refunded payments count
-- as refunded, not net. Amounts are in each currency's minor unit, never converted.
create function public.admin_billing_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'revenue', coalesce((
      select jsonb_agg(r order by r ->> 'currency')
      from (
        select jsonb_build_object(
          'currency', g.currency,
          'payments', count(*),
          'gross_minor', sum(g.amount_minor),
          'refunded_minor', coalesce(sum(g.amount_minor) filter (where g.refunded_at is not null), 0),
          'net_minor', coalesce(sum(g.amount_minor) filter (where g.refunded_at is null), 0),
          'net_30d_minor', coalesce(sum(g.amount_minor) filter (where g.refunded_at is null and g.created_at > now() - interval '30 days'), 0)
        ) as r
        from public.billing_grants g
        where g.amount_minor is not null and g.currency is not null and g.provider <> 'manual'
        group by g.currency
      ) x
    ), '[]'::jsonb),
    'active', jsonb_build_object(
      'gold', (select count(*) from public.subscriptions where status = 'active' and plan_id = 'gold'),
      'platinum', (select count(*) from public.subscriptions where status = 'active' and plan_id = 'platinum'),
      'past_due', (select count(*) from public.subscriptions where status = 'past_due'),
      'cancelling', (select count(*) from public.subscriptions where status = 'active' and cancel_at_period_end)
    ),
    'unprocessed_events', (select count(*) from public.payment_events where processed_at is null),
    'failed_events', (select count(*) from public.payment_events where processed_at is null and error is not null)
  );
end;
$$;

comment on function public.admin_billing_summary() is
  'M9-A1: revenue per currency (gross, refunded, net, net last 30 days), live subscriptions, stuck webhooks. Admins only.';

-- ── 3. One user's subscriptions (user page) ─────────────────────────────────────────────────
create function public.admin_user_subscriptions(p_user_id uuid)
returns setof public.subscriptions
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query select * from public.subscriptions where user_id = p_user_id order by created_at desc limit 50;
end;
$$;

-- ── 4. Manual plan change (support) ─────────────────────────────────────────────────────────
-- Gold or Platinum for 1–366 days as a 'manual' subscription that ends on its date (it never
-- renews), optionally with the plan's monthly credits (valid until the end, at most a month).
-- 'free' ends the user's manual subscriptions. Provider subscriptions are never touched here:
-- the student (or the provider's dashboard) cancels those. profiles.plan is then recomputed from
-- every live subscription, so it may stay paid if one is still running. Audited with a note.
create function public.admin_set_manual_plan(
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
  where user_id = p_user_id and provider = 'manual' and status in ('active', 'past_due');
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

comment on function public.admin_set_manual_plan(uuid, public.plan_tier, integer, boolean, text) is
  'M9-A1: support plan change: a manual Gold/Platinum subscription for 1–366 days (optional monthly credits), or free = end manual ones. Audited. Admins only.';

-- ── Privileges ──────────────────────────────────────────────────────────────────────────────
revoke all on function public.admin_list_subscriptions(public.subscription_status, text, integer, integer) from public, anon;
revoke all on function public.admin_billing_summary() from public, anon;
revoke all on function public.admin_user_subscriptions(uuid) from public, anon;
revoke all on function public.admin_set_manual_plan(uuid, public.plan_tier, integer, boolean, text) from public, anon;
grant execute on function public.admin_list_subscriptions(public.subscription_status, text, integer, integer) to authenticated;
grant execute on function public.admin_billing_summary() to authenticated;
grant execute on function public.admin_user_subscriptions(uuid) to authenticated;
grant execute on function public.admin_set_manual_plan(uuid, public.plan_tier, integer, boolean, text) to authenticated;
