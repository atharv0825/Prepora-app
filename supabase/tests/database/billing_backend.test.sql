-- M9-B1…B4: get_prices, webhook storage and application, the subscription lifecycle, refunds,
-- maintenance. Events are given already normalised (as billing-webhook passes them).
-- Run: supabase test db
begin;
select plan(58);

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'sub@prepora.test'),
  ('d0000000-0000-0000-0000-000000000002', 'pack@prepora.test');

-- Helper: store and apply one event; returns the apply result.
create function pg_temp.ev(p_provider public.payment_provider, p_event_id text, p_event jsonb)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  v := public.billing_record_event(p_provider, p_event_id, 'test.' || (p_event ->> 'action'), p_event);
  return public.billing_apply_event((v ->> 'id')::bigint, p_event);
end $$;

create function pg_temp.credits(p_user uuid, p_source public.credit_source)
returns bigint language sql as $$
  select coalesce(sum(remaining), 0) from public.credit_buckets where user_id = p_user and source = p_source
$$;

create function pg_temp.plan(p_user uuid) returns text language sql as $$
  select plan::text from public.profiles where id = p_user
$$;

-- ── B1: get_prices ──────────────────────────────────────────────────────────────────────────
select is(public.get_prices('IN') ->> 'provider', 'razorpay', 'India: Razorpay');
select is(jsonb_array_length(public.get_prices('IN') -> 'subscriptions'), 2, 'India: Gold and Platinum monthly');
select is(public.get_prices('in') -> 'subscriptions' -> 0 ->> 'id', 'in_gold_month', 'country code is case-insensitive; Gold first');
select is(jsonb_array_length(public.get_prices('IN') -> 'topups'), 2, 'India: two top-ups');
select is(public.get_prices('NP') -> 'exam_packs' -> 1 ->> 'id', 'sa_platinum_exam_pack', 'Nepal: South Asia packs');
select is(public.get_prices('NP') ->> 'provider', 'paddle', 'Nepal: Paddle');
select is((public.get_prices('SG') -> 'subscriptions' -> 0 ->> 'id'), 'sg_gold_month', 'Singapore: its own override');
select is((public.get_prices('SG') -> 'topups' -> 0 ->> 'id'), 'sea_topup_150', 'Singapore: the region''s top-up (no override)');
select is(jsonb_array_length(public.get_prices('SG') -> 'subscriptions'), 2, 'Singapore: the override replaces, never doubles');
select is((public.get_prices('NZ') -> 'subscriptions' -> 1 ->> 'currency'), 'NZD', 'New Zealand pays in NZD');
select is((public.get_prices('AU') -> 'subscriptions' -> 0 ->> 'currency'), 'AUD', 'Australia pays in AUD');
select is((public.get_prices('PH') ->> 'enabled')::boolean, false, 'a country not launched yet: prices, enabled false');
select is(public.get_prices('US'), null, 'a country not listed: null');
select is(public.get_prices(null), null, 'no country: null');
set local role anon;
select is(public.get_prices('IN') ->> 'country', 'IN', 'signed out visitors can call get_prices');
reset role;
select ok(not has_function_privilege('authenticated', 'public.billing_apply_event(bigint, jsonb)', 'execute'), 'students can''t apply events');
select ok(not has_function_privilege('anon', 'public.billing_record_event(public.payment_provider, text, text, jsonb)', 'execute'), 'visitors can''t store events');
select ok(not has_function_privilege('authenticated', 'public.billing_maintenance()', 'execute'), 'students can''t run maintenance');

-- ── Storing events ──────────────────────────────────────────────────────────────────────────
select is(public.billing_record_event('razorpay', 'evt_dup', 'x', '{}') ->> 'duplicate', 'false', 'a new event is stored');
select is(public.billing_record_event('razorpay', 'evt_dup', 'x', '{}') ->> 'duplicate', 'true', 'a redelivery is recognised');
select is(public.billing_record_event('razorpay', 'evt_dup', 'x', '{}') ->> 'processed', 'false', '… and not processed yet');

-- ── Monthly subscription (Razorpay) ─────────────────────────────────────────────────────────
select is(pg_temp.ev('razorpay', 'e1', '{"action":"subscription_started","user_id":"d0000000-0000-0000-0000-000000000001",
  "price_id":"in_gold_month","subscription_id":"sub_1","customer_id":"cust_1"}') ->> 'result', 'applied', 'subscription starts');
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000001'), 'gold', 'the profile becomes Gold');
select is(pg_temp.credits('d0000000-0000-0000-0000-000000000001', 'monthly'), 8::bigint, 'starting grants no paid credits (only the Free 8 from sign-up)');

select pg_temp.ev('razorpay', 'e2', jsonb_build_object('action', 'payment_completed', 'subscription_id', 'sub_1', 'payment_id', 'pay_1',
  'provider_price_id', null, 'price_id', 'in_gold_month', 'period_start', now(), 'period_end', now() + interval '1 month', 'amount_minor', 29900, 'currency', 'INR'));
select is(pg_temp.credits('d0000000-0000-0000-0000-000000000001', 'monthly'), 108::bigint, 'the first charge grants Gold''s 100 credits');
select ok((select abs(extract(epoch from (b.expires_at - s.current_period_end))) < 1
  from public.credit_buckets b join public.billing_grants g on g.bucket_id = b.id join public.subscriptions s on s.id = g.subscription_id
  where g.grant_key = 'razorpay:pay_1'), 'the monthly credits expire with the period');
select ok((select abs(extract(epoch from (plan_expires_at - (now() + interval '1 month')))) < 5 from public.profiles
  where id = 'd0000000-0000-0000-0000-000000000001'), 'plan_expires_at = the period end');
select is(pg_temp.ev('razorpay', 'e2', '{"action":"payment_completed"}') ->> 'result', 'already_processed', 'a redelivered event changes nothing');
select pg_temp.ev('razorpay', 'e2b', jsonb_build_object('action', 'payment_completed', 'subscription_id', 'sub_1', 'payment_id', 'pay_1', 'price_id', 'in_gold_month'));
select is(pg_temp.credits('d0000000-0000-0000-0000-000000000001', 'monthly'), 108::bigint, 'the same payment in another event grants nothing more');

-- Upgrade Gold → Platinum: at once, plus the 120-credit difference for this period.
select pg_temp.ev('razorpay', 'e3', '{"action":"subscription_updated","subscription_id":"sub_1","price_id":"in_platinum_month"}');
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000001'), 'platinum', 'upgrade: Platinum at once');
select is(pg_temp.credits('d0000000-0000-0000-0000-000000000001', 'monthly'), 228::bigint, 'upgrade: +120 credits now');
select pg_temp.ev('razorpay', 'e3b', '{"action":"subscription_updated","subscription_id":"sub_1","price_id":"in_platinum_month"}');
select is(pg_temp.credits('d0000000-0000-0000-0000-000000000001', 'monthly'), 228::bigint, 'the upgrade credit is given once');

-- Downgrade Platinum → Gold: booked for the period end.
select is(pg_temp.ev('razorpay', 'e4', '{"action":"subscription_updated","subscription_id":"sub_1","price_id":"in_gold_month"}') ->> 'result',
  'downgrade_scheduled', 'downgrade: scheduled');
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000001'), 'platinum', 'downgrade: Platinum until the period ends');
select is((select scheduled_price_id from public.subscriptions where provider_subscription_id = 'sub_1'), 'in_gold_month', 'downgrade: the new price is booked');

-- Renewal at the new (Gold) price.
select pg_temp.ev('razorpay', 'e5', jsonb_build_object('action', 'payment_completed', 'subscription_id', 'sub_1', 'payment_id', 'pay_2',
  'price_id', 'in_gold_month', 'period_start', now() + interval '1 month', 'period_end', now() + interval '2 months'));
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000001'), 'gold', 'renewal applies the downgrade');
select is((select scheduled_price_id from public.subscriptions where provider_subscription_id = 'sub_1'), null, 'the booking is cleared');
select is((select credits from public.billing_grants where grant_key = 'razorpay:pay_2'), 100, 'renewal grants the new plan''s credits');

-- Failed renewal: past_due keeps the plan for the grace period, then back to Free.
select pg_temp.ev('razorpay', 'e6', '{"action":"subscription_past_due","subscription_id":"sub_1"}');
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_1'), 'past_due', 'past_due');
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000001'), 'gold', 'past_due keeps the plan');
update public.subscriptions set current_period_start = now() - interval '40 days', current_period_end = now() - interval '6 days'
where provider_subscription_id = 'sub_1';
select public.billing_maintenance();
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000001'), 'gold', 'still Gold 6 days after the period end (7-day grace)');
update public.subscriptions set current_period_end = now() - interval '8 days' where provider_subscription_id = 'sub_1';
select public.billing_maintenance();
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_1'), 'expired', 'grace over: expired');
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000001'), 'free', 'grace over: back to Free');

-- A new subscription that the student cancels at the period end, then the provider ends it.
select pg_temp.ev('paddle', 'p1', jsonb_build_object('action', 'payment_completed', 'user_id', 'd0000000-0000-0000-0000-000000000001',
  'price_id', 'sa_gold_month', 'subscription_id', 'sub_P', 'payment_id', 'txn_P1', 'period_end', now() + interval '1 month'));
select pg_temp.ev('paddle', 'p2', '{"action":"subscription_updated","subscription_id":"sub_P","cancel_at_period_end":true}');
select is((select cancel_at_period_end from public.subscriptions where provider_subscription_id = 'sub_P'), true, 'cancel at period end is recorded');
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000001'), 'gold', 'cancelled: the plan lasts until the period end');
select pg_temp.ev('paddle', 'p3', '{"action":"subscription_ended","subscription_id":"sub_P"}');
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_P'), 'cancelled', 'ended early: cancelled');
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000001'), 'free', 'ended: back to Free');

-- ── Exam pack and refund (Paddle) ───────────────────────────────────────────────────────────
select pg_temp.ev('paddle', 'p4', '{"action":"payment_completed","user_id":"d0000000-0000-0000-0000-000000000002",
  "price_id":"sa_platinum_exam_pack","payment_id":"txn_9","amount_minor":2199,"currency":"USD"}');
select is((select kind::text || ' ' || plan_id from public.subscriptions where provider_subscription_id = 'txn_9'), 'exam_pack platinum', 'an exam pack is a 3-month Platinum plan');
select is(pg_temp.credits('d0000000-0000-0000-0000-000000000002', 'exam_pack'), 660::bigint, 'with its 660 credits');
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000002'), 'platinum', 'the profile becomes Platinum');
select is(pg_temp.ev('paddle', 'p5', '{"action":"refunded","payment_id":"txn_9","amount_minor":1000}') ->> 'result', 'partial_refund_noted', 'a partial refund keeps the pack');
select is(pg_temp.ev('paddle', 'p6', '{"action":"refunded","payment_id":"txn_9","amount_minor":2199}') ->> 'result', 'refunded', 'a full refund');
select is(pg_temp.credits('d0000000-0000-0000-0000-000000000002', 'exam_pack'), 0::bigint, 'takes back the unspent credits');
select is(pg_temp.plan('d0000000-0000-0000-0000-000000000002'), 'free', 'and ends the pack');

-- ── Top-up ──────────────────────────────────────────────────────────────────────────────────
select pg_temp.ev('razorpay', 'r1', '{"action":"payment_completed","user_id":"d0000000-0000-0000-0000-000000000002",
  "price_id":"in_topup_50","order_id":"order_7","payment_id":"pay_7"}');
select is(pg_temp.credits('d0000000-0000-0000-0000-000000000002', 'topup'), 50::bigint, 'a top-up grants its credits');
select ok((select expires_at between now() + interval '364 days' and now() + interval '366 days' from public.credit_buckets
  where user_id = 'd0000000-0000-0000-0000-000000000002' and source = 'topup'), 'top-up credits last 12 months');

-- ── Unmatched and unknown ───────────────────────────────────────────────────────────────────
select is(pg_temp.ev('razorpay', 'u1', '{"action":"subscription_past_due","subscription_id":"sub_nobody"}') ->> 'result', 'unmatched', 'an event for nobody is stored as unmatched');
select is((select error from public.payment_events where event_id = 'u1'), 'no matching user', '… with the reason');

select * from finish();
rollback;
