-- Exam pack upgrades (Gold pack → Platinum pack for the days left). billing_apply_event gains
-- one branch: a payment_completed for an exam pack price whose metadata names the pack it
-- upgrades (upgrade_of) moves that pack to the new plan, keeping its end date, and grants the
-- prorated extra credits (upgrade_credits, capped at the new pack's credits). The rest of the
-- function is unchanged from 20261207090000_billing_backend.sql.

create or replace function public.billing_apply_event(p_id bigint, p_event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.payment_events;
  v_action text := p_event ->> 'action';
  v_price public.prices;
  v_new_price public.prices;
  v_sub public.subscriptions;
  v_user uuid;
  v_grant public.billing_grants;
  v_sub_ref text := nullif(p_event ->> 'subscription_id', '');
  v_payment text := nullif(p_event ->> 'payment_id', '');
  v_start timestamptz := (p_event ->> 'period_start')::timestamptz;
  v_end timestamptz := (p_event ->> 'period_end')::timestamptz;
  v_status text := p_event ->> 'status';
  v_amount integer := (p_event ->> 'amount_minor')::integer;
  v_currency text := upper(p_event ->> 'currency');
  v_monthly integer;
  v_old_monthly integer;
  v_result text := 'applied';
begin
  select * into v_row from public.payment_events where id = p_id for update;
  if v_row.id is null then
    raise exception 'payment event % not found', p_id using errcode = 'P0002';
  end if;
  if v_row.processed_at is not null then
    return jsonb_build_object('action', v_action, 'result', 'already_processed');
  end if;

  if v_action is null or v_action not in ('subscription_started', 'payment_completed', 'subscription_updated',
      'subscription_past_due', 'subscription_ended', 'refunded', 'ignored') then
    raise exception 'unknown billing action %', v_action using errcode = '22023';
  end if;

  -- What was bought: our price id from the checkout metadata, else the provider's price id.
  if nullif(p_event ->> 'price_id', '') is not null then
    select * into v_price from public.prices where id = p_event ->> 'price_id';
  end if;
  if v_price.id is null and nullif(p_event ->> 'provider_price_id', '') is not null then
    select * into v_price from public.prices
    where provider = v_row.provider and provider_price_id = p_event ->> 'provider_price_id';
  end if;

  if v_sub_ref is not null then
    select * into v_sub from public.subscriptions where provider = v_row.provider and provider_subscription_id = v_sub_ref;
  end if;
  if v_action = 'refunded' and v_payment is not null then
    select * into v_grant from public.billing_grants
    where provider = v_row.provider and provider_payment_id = v_payment
    order by created_at limit 1;
  end if;

  v_user := coalesce((nullif(p_event ->> 'user_id', ''))::uuid, v_sub.user_id, v_grant.user_id);
  if v_action = 'ignored' or v_user is null or not exists (select 1 from auth.users where id = v_user) then
    update public.payment_events
    set processed_at = now(), error = case when v_action = 'ignored' then null else 'no matching user' end
    where id = p_id;
    return jsonb_build_object('action', v_action, 'result', case when v_action = 'ignored' then 'ignored' else 'unmatched' end);
  end if;

  -- One user's billing changes one at a time (events for the same purchase can arrive together).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('prepora.billing:' || v_user::text, 0));
  if v_sub_ref is not null then
    select * into v_sub from public.subscriptions where provider = v_row.provider and provider_subscription_id = v_sub_ref;
  end if;

  if v_action in ('subscription_started', 'payment_completed') and v_price.id is null then
    raise exception 'no price for this event' using errcode = '22023';
  end if;

  if v_action = 'subscription_started'
     or (v_action = 'payment_completed' and v_price.kind = 'subscription')
     or (v_action = 'subscription_updated' and v_sub.id is null and v_price.kind = 'subscription') then
    -- ── A monthly subscription starts, renews, or is first seen through an update ──────────
    if v_price.kind <> 'subscription' then
      raise exception 'price % is not a subscription', v_price.id using errcode = '22023';
    end if;
    if v_sub_ref is null then
      raise exception 'subscription event without a subscription id' using errcode = '22023';
    end if;
    v_start := coalesce(v_start, case when v_sub.id is not null and v_action = 'payment_completed'
      then greatest(v_sub.current_period_end, now()) else now() end);
    v_end := coalesce(v_end, v_start + interval '1 month');

    insert into public.subscriptions as s (user_id, plan_id, kind, price_id, provider, provider_subscription_id,
      provider_customer_id, status, current_period_start, current_period_end, currency, amount_minor)
    values (v_user, v_price.plan_id, 'subscription', v_price.id, v_row.provider, v_sub_ref,
      nullif(p_event ->> 'customer_id', ''), 'active', v_start, v_end, v_price.currency, v_price.amount_minor)
    on conflict (provider, provider_subscription_id) where provider_subscription_id is not null do update set
      -- A payment is for the price it paid: it applies a scheduled downgrade, or an upgrade.
      plan_id = case when v_action = 'payment_completed' then excluded.plan_id else s.plan_id end,
      price_id = case when v_action = 'payment_completed' then excluded.price_id else s.price_id end,
      scheduled_price_id = case when v_action = 'payment_completed' then null else s.scheduled_price_id end,
      provider_customer_id = coalesce(excluded.provider_customer_id, s.provider_customer_id),
      status = case when s.status in ('cancelled', 'expired') and v_action <> 'payment_completed' then s.status else 'active' end,
      past_due_since = null,
      -- Periods only move forward (events can arrive out of order).
      current_period_start = case when excluded.current_period_end >= s.current_period_end then excluded.current_period_start else s.current_period_start end,
      current_period_end = greatest(s.current_period_end, excluded.current_period_end),
      currency = case when v_action = 'payment_completed' then excluded.currency else s.currency end,
      amount_minor = case when v_action = 'payment_completed' then excluded.amount_minor else s.amount_minor end
    returning * into v_sub;

    if v_action = 'payment_completed' then
      if v_payment is null then
        raise exception 'payment event without a payment id' using errcode = '22023';
      end if;
      -- The paid period's monthly credits; they expire with the period (no roll-over).
      v_monthly := coalesce(((select limits from public.plans where id = v_price.plan_id) ->> 'monthly_credits')::integer, 0);
      perform public.billing_grant(v_row.provider || ':' || v_payment, v_user, v_sub.id, 'period', 'monthly',
        v_monthly, v_end, v_price.id, v_row.provider, v_payment, coalesce(v_amount, v_price.amount_minor),
        coalesce(v_currency, v_price.currency));
    end if;

  elsif v_action = 'payment_completed' and v_price.kind = 'exam_pack' and nullif(p_event ->> 'upgrade_of', '') is not null then
    -- ── Exam pack upgrade: Gold pack → Platinum pack, same end date ─────────────────────────
    -- manage-subscription charged the price difference for the days left and put the prorated
    -- extra credits in the checkout metadata (set by us, carried in the signed webhook).
    select * into v_sub from public.subscriptions
    where id = (p_event ->> 'upgrade_of')::uuid and user_id = v_user and kind = 'exam_pack'
    for update;
    if v_sub.id is null then
      raise exception 'upgrade of an unknown exam pack' using errcode = 'P0002';
    end if;
    if v_payment is null then
      raise exception 'exam pack upgrade without a payment id' using errcode = '22023';
    end if;
    if public.plan_rank(v_price.plan_id) > public.plan_rank(v_sub.plan_id) then
      update public.subscriptions set plan_id = v_price.plan_id, price_id = v_price.id
      where id = v_sub.id returning * into v_sub;
    end if;
    perform public.billing_grant(v_row.provider || ':' || v_payment, v_user, v_sub.id, 'upgrade', 'exam_pack',
      least(greatest(coalesce((nullif(p_event ->> 'upgrade_credits', ''))::integer, 0), 0), coalesce(v_price.credits, 0)),
      v_sub.current_period_end, v_price.id, v_row.provider, v_payment, v_amount, v_currency);
    v_result := 'pack_upgraded';

  elsif v_action = 'payment_completed' and v_price.kind = 'exam_pack' then
    -- ── Exam pack: 3 months of the plan and its credits, paid once ─────────────────────────
    v_sub_ref := coalesce(nullif(p_event ->> 'order_id', ''), v_payment);
    if v_sub_ref is null then
      raise exception 'exam pack payment without an order or payment id' using errcode = '22023';
    end if;
    insert into public.subscriptions (user_id, plan_id, kind, price_id, provider, provider_subscription_id,
      provider_customer_id, status, current_period_start, current_period_end, currency, amount_minor)
    values (v_user, v_price.plan_id, 'exam_pack', v_price.id, v_row.provider, v_sub_ref,
      nullif(p_event ->> 'customer_id', ''), 'active', now(), now() + interval '3 months',
      v_price.currency, v_price.amount_minor)
    on conflict (provider, provider_subscription_id) where provider_subscription_id is not null do nothing;
    select * into v_sub from public.subscriptions where provider = v_row.provider and provider_subscription_id = v_sub_ref;
    perform public.billing_grant(v_row.provider || ':' || coalesce(v_payment, v_sub_ref), v_user, v_sub.id, 'exam_pack',
      'exam_pack', v_price.credits, v_sub.current_period_end, v_price.id, v_row.provider, coalesce(v_payment, v_sub_ref),
      coalesce(v_amount, v_price.amount_minor), coalesce(v_currency, v_price.currency));

  elsif v_action = 'payment_completed' and v_price.kind = 'topup' then
    -- ── Top-up: credits valid for 12 months (§2.5) ─────────────────────────────────────────
    v_payment := coalesce(v_payment, nullif(p_event ->> 'order_id', ''));
    if v_payment is null then
      raise exception 'top-up payment without a payment id' using errcode = '22023';
    end if;
    perform public.billing_grant(v_row.provider || ':' || v_payment, v_user, null, 'topup', 'topup',
      v_price.credits, now() + interval '12 months', v_price.id, v_row.provider, v_payment,
      coalesce(v_amount, v_price.amount_minor), coalesce(v_currency, v_price.currency));

  elsif v_action = 'subscription_updated' then
    -- ── Plan change, scheduled cancellation, status or period from the provider ────────────
    if v_sub.id is null then
      raise exception 'update for an unknown subscription' using errcode = 'P0002';
    end if;
    if v_price.id is not null and v_price.kind = 'subscription' and v_price.id <> v_sub.price_id then
      if public.plan_rank(v_price.plan_id) > public.plan_rank(v_sub.plan_id) then
        -- Upgrade: the new plan at once, and the credit difference for the rest of this period.
        -- (The provider charges the prorated difference.)
        v_old_monthly := coalesce(((select limits from public.plans where id = v_sub.plan_id) ->> 'monthly_credits')::integer, 0);
        v_monthly := coalesce(((select limits from public.plans where id = v_price.plan_id) ->> 'monthly_credits')::integer, 0);
        update public.subscriptions
        set plan_id = v_price.plan_id, price_id = v_price.id, scheduled_price_id = null,
            currency = v_price.currency, amount_minor = v_price.amount_minor
        where id = v_sub.id returning * into v_sub;
        perform public.billing_grant('upgrade:' || v_sub.id || ':' || v_sub.current_period_end || ':' || v_price.plan_id,
          v_user, v_sub.id, 'upgrade', 'monthly', v_monthly - v_old_monthly, v_sub.current_period_end, v_price.id,
          v_row.provider, null, null, null);
      elsif public.plan_rank(v_price.plan_id) < public.plan_rank(v_sub.plan_id) then
        -- Downgrade: keep the plan until the period ends; the next payment applies the new price.
        update public.subscriptions set scheduled_price_id = v_price.id where id = v_sub.id returning * into v_sub;
        v_result := 'downgrade_scheduled';
      else
        update public.subscriptions set price_id = v_price.id, scheduled_price_id = null where id = v_sub.id returning * into v_sub;
      end if;
    end if;
    update public.subscriptions s set
      cancel_at_period_end = coalesce((p_event ->> 'cancel_at_period_end')::boolean, s.cancel_at_period_end),
      cancelled_at = case
        when (p_event ->> 'cancel_at_period_end')::boolean then coalesce(s.cancelled_at, now())
        when (p_event ->> 'cancel_at_period_end')::boolean = false then null
        else s.cancelled_at end,
      status = case
        when s.status in ('cancelled', 'expired') then s.status
        when v_status = 'past_due' then 'past_due'
        when v_status = 'active' then 'active'
        else s.status end,
      past_due_since = case
        when v_status = 'past_due' then coalesce(s.past_due_since, now())
        when v_status = 'active' then null
        else s.past_due_since end,
      current_period_start = case when v_end is not null and v_end >= s.current_period_end then coalesce(v_start, s.current_period_start) else s.current_period_start end,
      current_period_end = greatest(s.current_period_end, coalesce(v_end, s.current_period_end))
    where s.id = v_sub.id returning * into v_sub;

  elsif v_action = 'subscription_past_due' then
    -- ── A renewal failed: keep the plan through the grace period ───────────────────────────
    if v_sub.id is null then
      raise exception 'past_due for an unknown subscription' using errcode = 'P0002';
    end if;
    update public.subscriptions
    set status = case when status in ('cancelled', 'expired') then status else 'past_due' end,
        past_due_since = coalesce(past_due_since, now())
    where id = v_sub.id returning * into v_sub;

  elsif v_action = 'subscription_ended' then
    -- ── Cancelled or ran out: back to Free unless another subscription gives access ────────
    if v_sub.id is null then
      raise exception 'end of an unknown subscription' using errcode = 'P0002';
    end if;
    update public.subscriptions
    set status = (case when current_period_end <= now() + interval '1 hour' then 'expired' else 'cancelled' end)::public.subscription_status,
        cancelled_at = coalesce(cancelled_at, now()),
        current_period_end = least(current_period_end, greatest(now(), current_period_start + interval '1 second'))
    where id = v_sub.id and status in ('active', 'past_due')
    returning * into v_sub;
    if v_sub.id is null then
      select * into v_sub from public.subscriptions where provider = v_row.provider and provider_subscription_id = v_sub_ref;
    end if;

  elsif v_action = 'refunded' then
    -- ── Refund: take back what the payment granted and is still unspent ────────────────────
    if v_grant.id is null then
      v_result := 'no_grant';
    elsif v_grant.refunded_at is not null then
      v_result := 'already_refunded';
    elsif v_amount is not null and v_grant.amount_minor is not null and v_amount < v_grant.amount_minor then
      v_result := 'partial_refund_noted'; -- a goodwill partial refund keeps the credits
    else
      update public.billing_grants set refunded_at = now() where id = v_grant.id;
      -- Credits already spent stay spent; what's left in the bucket goes (ledger: admin_adjust).
      with b as (
        select id, user_id, remaining from public.credit_buckets
        where id = v_grant.bucket_id and remaining > 0
        for update
      ),
      taken as (
        update public.credit_buckets c set remaining = 0
        from b where c.id = b.id
        returning b.id, b.user_id, b.remaining
      )
      insert into public.credit_ledger (user_id, bucket_id, delta, reason)
      select t.user_id, t.id, -t.remaining, 'admin_adjust' from taken t;
      v_result := 'refunded';
      -- An exam pack refund ends the pack.
      if v_grant.kind = 'exam_pack' and v_grant.subscription_id is not null then
        update public.subscriptions set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
          current_period_end = least(current_period_end, greatest(now(), current_period_start + interval '1 second'))
        where id = v_grant.subscription_id and status in ('active', 'past_due')
        returning * into v_sub;
      end if;
    end if;
  end if;

  perform public.billing_sync_profile(v_user);
  update public.payment_events
  set processed_at = now(), error = null, user_id = v_user, subscription_id = coalesce(v_sub.id, v_grant.subscription_id)
  where id = p_id;
  return jsonb_build_object('action', v_action, 'result', v_result, 'subscription_id', coalesce(v_sub.id, v_grant.subscription_id));
end;
$$;
