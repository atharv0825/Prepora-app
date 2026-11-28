-- Razorpay plan change by replacement (any payment method): billing_apply_event subscription_replaced.
-- Run: supabase test db
begin;
select plan(12);

insert into auth.users (id, email) values
  ('b7000000-0000-0000-0000-000000000001', 'up@prepora.test'),
  ('b7000000-0000-0000-0000-000000000002', 'down@prepora.test');

create function pg_temp.ev(p_id text, p_event jsonb) returns jsonb language sql as $$
  select public.billing_apply_event((public.billing_record_event('razorpay', p_id, 't', '{}') ->> 'id')::bigint, p_event)
$$;
create function pg_temp.monthly(p_user uuid) returns bigint language sql as $$
  select coalesce(sum(remaining), 0) from public.credit_buckets where user_id = p_user and source = 'monthly'
$$;

-- ── Upgrade: Gold → Platinum ────────────────────────────────────────────────────────────────
select pg_temp.ev('r1', '{"action":"payment_completed","user_id":"b7000000-0000-0000-0000-000000000001","price_id":"in_gold_month","subscription_id":"sub_OLD1","payment_id":"pay_1"}');
select is(pg_temp.ev('r2', '{"action":"subscription_replaced","user_id":"b7000000-0000-0000-0000-000000000001","price_id":"in_platinum_month","subscription_id":"sub_NEW1","replaces":"sub_OLD1","payment_id":"pay_auth1","amount_minor":30000,"currency":"INR"}') ->> 'result',
  'replacement_booked', 'the new subscription is booked');
select is((select plan::text from public.profiles where id = 'b7000000-0000-0000-0000-000000000001'), 'platinum', 'upgrade: Platinum at once');
select is(pg_temp.monthly('b7000000-0000-0000-0000-000000000001'), 228::bigint, 'upgrade: +120 credits now (8 Free + 100 Gold + 120)');
select is((select replaced_by_provider_id from public.subscriptions where provider_subscription_id = 'sub_OLD1'), 'sub_NEW1', 'the old one points at the new one');
select is((select cancel_at_period_end from public.subscriptions where provider_subscription_id = 'sub_OLD1'), false, 'the old one runs to its end (no gap before the new one)');
select is((select amount_minor from public.billing_grants where provider_payment_id = 'pay_auth1'), 30000, 'the upfront difference is recorded as revenue');

-- At the old period end: the new one starts and charges, the old one ends.
select pg_temp.ev('r3', '{"action":"payment_completed","user_id":"b7000000-0000-0000-0000-000000000001","price_id":"in_platinum_month","subscription_id":"sub_NEW1","payment_id":"pay_2"}');
select pg_temp.ev('r4', '{"action":"subscription_ended","subscription_id":"sub_OLD1"}');
select is((select plan::text from public.profiles where id = 'b7000000-0000-0000-0000-000000000001'), 'platinum', 'still Platinum on the new subscription');
select is((select count(*) from public.subscriptions where user_id = 'b7000000-0000-0000-0000-000000000001' and status = 'active'), 1::bigint, 'one live subscription');

-- ── Downgrade: Platinum → Gold ──────────────────────────────────────────────────────────────
select pg_temp.ev('d1', '{"action":"payment_completed","user_id":"b7000000-0000-0000-0000-000000000002","price_id":"in_platinum_month","subscription_id":"sub_OLD2","payment_id":"pay_3"}');
select pg_temp.ev('d2', '{"action":"subscription_replaced","user_id":"b7000000-0000-0000-0000-000000000002","price_id":"in_gold_month","subscription_id":"sub_NEW2","replaces":"sub_OLD2"}');
select is((select plan::text from public.profiles where id = 'b7000000-0000-0000-0000-000000000002'), 'platinum', 'downgrade: Platinum until the period ends');
select is((select scheduled_price_id from public.subscriptions where provider_subscription_id = 'sub_OLD2'), 'in_gold_month', 'downgrade: Gold is booked');
select is(pg_temp.monthly('b7000000-0000-0000-0000-000000000002'), 228::bigint, 'downgrade: no credits change now');

select throws_ok($$ select pg_temp.ev('d3', '{"action":"subscription_replaced","user_id":"b7000000-0000-0000-0000-000000000002","price_id":"in_gold_month","subscription_id":"sub_X","replaces":"sub_nobody"}') $$,
  'P0002', null, 'replacing an unknown subscription is an error (the provider retries)');

select * from finish();
rollback;
