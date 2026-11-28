-- M9-B1…B4: billing backend in the database.
--
--   B1  get_prices(country): what a country can buy, in its currency, from its provider.
--   B3  billing_record_event / billing_apply_event: billing-webhook stores each verified event,
--       then applies it in one transaction: subscriptions, profiles.plan, credits.
--   B4  the lifecycle those events drive: renewal (credits per paid period), upgrade (plan now +
--       the credit difference at once), downgrade (scheduled for the period end), cancel at period
--       end, failed payment → past_due with a grace period → back to Free; billing_maintenance()
--       (hourly) expires what has run out.
--
-- The Edge Functions (create-checkout, billing-webhook, manage-subscription) verify signatures,
-- talk to Razorpay and Paddle and turn each provider's event into one normalised shape (below).
-- Everything that changes money-backed state happens here, so it is atomic and tested in pgTAP.
--
-- Normalised event (p_event jsonb), every key optional except action:
--   action          a BillingAction (packages/shared/src/api/billing.ts)
--   user_id         from the checkout metadata (Razorpay notes / Paddle custom_data)
--   price_id        ours, from the metadata; or provider_price_id (Razorpay plan_…, Paddle pri_…)
--   subscription_id the provider's subscription id (sub_…)
--   order_id        Razorpay order (exam packs, top-ups)
--   payment_id      the provider's payment (Razorpay pay_…) or transaction (Paddle txn_…)
--   customer_id     the provider's customer (Paddle ctm_…, Razorpay cust_…)
--   period_start, period_end  ISO timestamps of the paid period
--   status          active | past_due | cancelled, when the event states it
--   cancel_at_period_end  boolean, when the event states it
--   amount_minor, currency    what was paid (or refunded, for refunds)

-- ── 1. Schema additions ─────────────────────────────────────────────────────────────────────
alter table public.subscriptions
  -- A downgrade waits for the period end (M9-B4): the new price applies from the next payment.
  add column scheduled_price_id text references public.prices (id) on update cascade,
  -- When the subscription went past_due (start of the grace period).
  add column past_due_since timestamptz;

comment on column public.subscriptions.scheduled_price_id is
  'Downgrade booked for the period end (M9-B4); the plan changes with the next paid period.';

-- Every credit grant billing made, keyed so a grant can never happen twice (a redelivered webhook,
-- the same payment in two events). Refunds find the bucket to take back through it. Also the
-- revenue record for the admin (M9-A1).
create table public.billing_grants (
  id uuid primary key default gen_random_uuid(),
  -- "<provider>:<payment id>" for payments; "upgrade:<subscription>:<period end>:<plan>" for upgrades.
  grant_key text not null unique check (char_length(grant_key) between 3 and 300),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  kind text not null check (kind in ('period', 'exam_pack', 'topup', 'upgrade')),
  price_id text references public.prices (id) on update cascade,
  bucket_id uuid references public.credit_buckets (id) on delete set null,
  credits integer not null check (credits >= 0),
  provider public.payment_provider not null,
  provider_payment_id text check (char_length(provider_payment_id) between 1 and 100),
  amount_minor integer check (amount_minor >= 0),
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.billing_grants is
  'Credit grants from billing (M9-B3/B4), idempotent by grant_key; refunds take back their bucket.';

create index billing_grants_payment_idx on public.billing_grants (provider, provider_payment_id)
  where provider_payment_id is not null;
create index billing_grants_user_idx on public.billing_grants (user_id, created_at desc);

alter table public.billing_grants enable row level security;
revoke all on table public.billing_grants from anon, authenticated;
-- No grants, no policies: service role only.

-- ── 2. Prices for a country (M9-B1) ─────────────────────────────────────────────────────────
-- The active prices a country gets: its own override rows, else its region's row for each offer
-- (offer = kind, plan, period, credits; see M9-C1).
create function public.prices_for_country(p_country text)
returns setof public.prices
language sql
stable
set search_path = ''
as $$
  select p.*
  from public.prices p
  join public.country_regions c on c.country_code = upper(p_country) and c.region = p.region
  where p.is_active
    and (
      p.country_code = c.country_code
      or (p.country_code is null and not exists (
        select 1 from public.prices o
        where o.is_active and o.country_code = c.country_code
          and o.kind = p.kind
          and o.plan_id is not distinct from p.plan_id
          and o.period is not distinct from p.period
          and o.credits is not distinct from p.credits
      ))
    );
$$;

comment on function public.prices_for_country(text) is
  'Active prices for a country: its override rows, else its region''s (M9-B1). RLS applies.';

-- Pricing page and checkout. null when the country isn't listed (no prices anywhere for it).
-- enabled = the country is open for sign-up (§8.2); checkout requires it.
create function public.get_prices(p_country text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with c as (
    select country_code, region, is_enabled from public.country_regions where country_code = upper(p_country)
  ),
  p as (
    select * from public.prices_for_country(p_country)
  ),
  item as (
    select p.kind, p.plan_id, p.credits, p.amount_minor,
      jsonb_build_object('id', p.id, 'plan_id', p.plan_id, 'period', p.period, 'credits', p.credits,
                         'currency', p.currency, 'amount_minor', p.amount_minor) as j
    from p
  )
  select case when c.country_code is null then null else jsonb_build_object(
    'country', c.country_code,
    'region', c.region,
    'enabled', c.is_enabled,
    'provider', (select min(provider::text) from p),
    'subscriptions', coalesce((select jsonb_agg(j order by public.plan_rank(plan_id)) from item where kind = 'subscription'), '[]'::jsonb),
    'exam_packs', coalesce((select jsonb_agg(j order by public.plan_rank(plan_id)) from item where kind = 'exam_pack'), '[]'::jsonb),
    'topups', coalesce((select jsonb_agg(j order by credits, amount_minor) from item where kind = 'topup'), '[]'::jsonb)
  ) end
  from (select 1) one left join c on true;
$$;

comment on function public.get_prices(text) is
  'M9-B1: plans, exam packs and top-ups for a country, in its currency and provider; null if not listed.';

grant execute on function public.get_prices(text) to anon, authenticated, service_role;
grant execute on function public.prices_for_country(text) to anon, authenticated, service_role;

-- ── 3. Access and the profile cache ─────────────────────────────────────────────────────────
-- How long a subscription gives its plan. A renewing one keeps it a day past the period end (the
-- renewal webhook may come late); past_due keeps it 7 days past (the grace period, M9-B4); an
-- exam pack or a cancelled-at-period-end subscription ends exactly at the period end.
create function public.subscription_access_until(p_status public.subscription_status, p_kind public.price_kind,
  p_cancel_at_period_end boolean, p_period_end timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status not in ('active', 'past_due') then null
    when p_kind = 'exam_pack' or p_cancel_at_period_end then p_period_end
    when p_status = 'past_due' then p_period_end + interval '7 days'
    else p_period_end + interval '1 day'
  end;
$$;

-- profiles.plan / plan_expires_at from the best subscription that still gives access; Free if none.
create function public.billing_sync_profile(p_user_id uuid)
returns public.plan_tier
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_plan public.plan_tier;
  v_end timestamptz;
begin
  select s.plan_id, s.current_period_end into v_plan, v_end
  from public.subscriptions s
  where s.user_id = p_user_id
    and public.subscription_access_until(s.status, s.kind, s.cancel_at_period_end, s.current_period_end) > now()
  order by public.plan_rank(s.plan_id) desc, s.current_period_end desc
  limit 1;

  update public.profiles
  set plan = coalesce(v_plan, 'free'), plan_expires_at = v_end
  where id = p_user_id
    and (plan is distinct from coalesce(v_plan, 'free') or plan_expires_at is distinct from v_end);
  return coalesce(v_plan, 'free');
end;
$$;

comment on function public.billing_sync_profile(uuid) is
  'Sets profiles.plan and plan_expires_at from the user''s live subscriptions (M9-B3). Service role only.';

-- ── 4. Grants (idempotent) ──────────────────────────────────────────────────────────────────
-- Records the grant under its key and gives the credits once. A grant whose credits would already
-- be expired (a very late webhook) is recorded without a bucket. Returns the bucket (or null).
create function public.billing_grant(p_key text, p_user_id uuid, p_subscription_id uuid, p_kind text,
  p_source public.credit_source, p_credits integer, p_expires_at timestamptz, p_price_id text,
  p_provider public.payment_provider, p_payment_id text, p_amount_minor integer, p_currency text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_grant uuid;
  v_bucket uuid;
begin
  insert into public.billing_grants (grant_key, user_id, subscription_id, kind, price_id, credits, provider,
    provider_payment_id, amount_minor, currency)
  values (p_key, p_user_id, p_subscription_id, p_kind, p_price_id, greatest(coalesce(p_credits, 0), 0), p_provider,
    p_payment_id, p_amount_minor, p_currency)
  on conflict (grant_key) do nothing
  returning id into v_grant;
  if v_grant is null then
    return null; -- already granted
  end if;
  if coalesce(p_credits, 0) > 0 and (p_expires_at is null or p_expires_at > now()) then
    v_bucket := public.grant_credits(p_user_id, p_source, p_credits, p_expires_at);
    update public.billing_grants set bucket_id = v_bucket where id = v_grant;
  end if;
  return v_bucket;
end;
$$;

-- ── 5. Webhook events (M9-B3) ───────────────────────────────────────────────────────────────
-- Store first. A redelivery returns the stored row (duplicate = true); billing-webhook re-applies
-- it only if it was never processed (an earlier attempt failed).
create function public.billing_record_event(p_provider public.payment_provider, p_event_id text,
  p_event_type text, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_processed timestamptz;
begin
  insert into public.payment_events (provider, event_id, event_type, payload)
  values (p_provider, p_event_id, p_event_type, p_payload)
  on conflict (provider, event_id) do nothing
  returning id into v_id;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'duplicate', false, 'processed', false);
  end if;
  select id, processed_at into v_id, v_processed
  from public.payment_events where provider = p_provider and event_id = p_event_id;
  return jsonb_build_object('id', v_id, 'duplicate', true, 'processed', v_processed is not null);
end;
$$;

-- Keeps why applying failed; processed_at stays null so a redelivery tries again.
create function public.billing_event_failed(p_id bigint, p_error text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.payment_events set error = left(p_error, 2000) where id = p_id and processed_at is null;
$$;

create function public.billing_apply_event(p_id bigint, p_event jsonb)
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

comment on function public.billing_apply_event(bigint, jsonb) is
  'M9-B3/B4: applies one stored, verified webhook (normalised by billing-webhook). Service role only.';

-- ── 6. Hourly maintenance (M9-B4) ───────────────────────────────────────────────────────────
-- Subscriptions whose access has run out (no renewal, grace period over, exam pack finished,
-- cancelled at period end) expire, and their users go back to Free (or to another live plan).
create function public.billing_maintenance()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_users uuid[];
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('prepora.billing_maintenance', 0)) then
    return jsonb_build_object('status', 'skipped');
  end if;
  with due as (
    update public.subscriptions s set status = 'expired'
    where s.status in ('active', 'past_due')
      and public.subscription_access_until(s.status, s.kind, s.cancel_at_period_end, s.current_period_end) <= now()
    returning s.user_id
  )
  select array_agg(distinct user_id) into v_users from due;
  -- Also anyone whose cached plan has ended without a subscription change (e.g. a deleted one).
  select array_agg(distinct u) into v_users from (
    select unnest(coalesce(v_users, '{}')) as u
    union
    select p.id from public.profiles p where p.plan <> 'free' and p.plan_expires_at < now() - interval '7 days'
  ) x;
  perform public.billing_sync_profile(u) from unnest(coalesce(v_users, '{}')) as u;
  return jsonb_build_object('status', 'ok', 'users_synced', coalesce(array_length(v_users, 1), 0));
end;
$$;

comment on function public.billing_maintenance() is
  'Hourly (pg_cron): expire subscriptions past their access, then resync those users'' plans (M9-B4).';

-- ── 7. Changes made from the app (manage-subscription, M9-B5) ───────────────────────────────
-- Recorded straight away so the student sees them; the provider's webhook confirms them later.
create function public.billing_mark_cancel(p_subscription_id uuid)
returns public.subscriptions
language sql
volatile
security definer
set search_path = ''
as $$
  update public.subscriptions
  set cancel_at_period_end = true, cancelled_at = coalesce(cancelled_at, now())
  where id = p_subscription_id and kind = 'subscription' and status in ('active', 'past_due')
  returning *;
$$;

create function public.billing_mark_scheduled_change(p_subscription_id uuid, p_price_id text)
returns public.subscriptions
language sql
volatile
security definer
set search_path = ''
as $$
  update public.subscriptions set scheduled_price_id = p_price_id
  where id = p_subscription_id and kind = 'subscription' and status in ('active', 'past_due')
  returning *;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.subscription_access_until(public.subscription_status, public.price_kind, boolean, timestamptz)',
    'public.billing_sync_profile(uuid)',
    'public.billing_grant(text, uuid, uuid, text, public.credit_source, integer, timestamptz, text, public.payment_provider, text, integer, text)',
    'public.billing_record_event(public.payment_provider, text, text, jsonb)',
    'public.billing_event_failed(bigint, text)',
    'public.billing_apply_event(bigint, jsonb)',
    'public.billing_maintenance()',
    'public.billing_mark_cancel(uuid)',
    'public.billing_mark_scheduled_change(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

grant execute on function public.billing_record_event(public.payment_provider, text, text, jsonb) to service_role;
grant execute on function public.billing_event_failed(bigint, text) to service_role;
grant execute on function public.billing_apply_event(bigint, jsonb) to service_role;
grant execute on function public.billing_maintenance() to service_role;
grant execute on function public.billing_mark_cancel(uuid) to service_role;
grant execute on function public.billing_mark_scheduled_change(uuid, text) to service_role;
grant execute on function public.billing_sync_profile(uuid) to service_role;

-- Hourly at :17 (credit maintenance runs at :07). Same name replaces the job, so re-running is safe.
select cron.schedule('prepora-billing-maintenance', '17 * * * *', 'select public.billing_maintenance()');
