-- M9-C1: billing schema (prices, subscriptions, payment_events), the §2.7 seed and RLS.
-- Run: supabase test db
begin;
select plan(47);

-- ── Structure ───────────────────────────────────────────────────────────────────────────────
select has_table('public', t, t || ' exists') from unnest(array['prices', 'subscriptions', 'payment_events']) as t;
select has_column('public', 'profiles', 'plan_expires_at', 'profiles.plan_expires_at exists');
select enum_has_labels('public', 'price_kind', array['subscription', 'exam_pack', 'topup'], 'price_kind values');
select enum_has_labels('public', 'billing_period', array['month', 'quarter'], 'billing_period values');
select enum_has_labels('public', 'payment_provider', array['razorpay', 'paddle', 'google_play', 'app_store', 'manual'], 'payment_provider values');
select enum_has_labels('public', 'subscription_status', array['active', 'past_due', 'cancelled', 'expired'], 'subscription_status values');
select ok((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ': RLS enabled')
from unnest(array['prices', 'subscriptions', 'payment_events']) as t;

-- ── Privileges: no client writes ────────────────────────────────────────────────────────────
select table_privs_are('public', 'prices', 'anon', array['SELECT'], 'anon: read prices only');
select table_privs_are('public', 'prices', 'authenticated', array['SELECT'], 'authenticated: read prices only');
select table_privs_are('public', 'subscriptions', 'anon', array[]::text[], 'anon: no access to subscriptions');
select table_privs_are('public', 'subscriptions', 'authenticated', array['SELECT'], 'authenticated: read subscriptions only');
select table_privs_are('public', 'payment_events', 'anon', array[]::text[], 'anon: no access to payment_events');
select table_privs_are('public', 'payment_events', 'authenticated', array[]::text[], 'authenticated: no access to payment_events');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'plan_expires_at', 'UPDATE'),
  'a user can''t change their own plan_expires_at');

-- ── Seed (§2.7) ─────────────────────────────────────────────────────────────────────────────
-- Every region sells both plans monthly and as an exam pack, plus at least one top-up.
select is(
  (select array_agg(region order by region) from (
    select region from public.prices where is_active and country_code is null
    group by region
    having count(*) filter (where kind = 'subscription') = 2
       and count(*) filter (where kind = 'exam_pack') = 2
       and count(*) filter (where kind = 'topup') >= 1
  ) r),
  array['IN', 'SA', 'SEA', 'EA', 'ANZ']::public.market_region[],
  'every region has the full set of offers');
select is((select array_agg(distinct provider) from public.prices where region = 'IN'), array['razorpay']::public.payment_provider[], 'India pays through Razorpay');
select is((select array_agg(distinct provider) from public.prices where region <> 'IN'), array['paddle']::public.payment_provider[], 'everyone else pays through Paddle');
select is((select amount_minor from public.prices where id = 'in_gold_month'), 29900, 'Gold in India: ₹299');
select is((select amount_minor from public.prices where id = 'in_platinum_exam_pack'), 169900, 'Platinum exam pack in India: ₹1,699');
select is((select array_agg(credits order by credits) from public.prices where region = 'IN' and kind = 'topup' and is_active),
  array[35, 55, 75, 90, 110, 130, 150, 165, 185], 'India top-ups: ₹100–₹500 steps (20261211)');
select is((select amount_minor || ' ' || currency from public.prices where id = 'sa_gold_month'), '400 USD', 'Gold in South Asia: US$4');
select is((select amount_minor || ' ' || currency from public.prices where id = 'sg_gold_month'), '800 USD', 'Singapore pays East Asia prices');
select is((select amount_minor || ' ' || currency from public.prices where id = 'nz_platinum_month'), '2600 NZD', 'Platinum in New Zealand: NZ$26');
select is((select credits from public.prices where id = 'sa_platinum_exam_pack'), 660, 'a Platinum exam pack grants 3 months of credits');

-- ── Constraints ─────────────────────────────────────────────────────────────────────────────
select throws_ok($$ insert into public.prices (id, kind, plan_id, region, credits, currency, amount_minor, provider)
  values ('x_topup_gold', 'topup', 'gold', 'SA', 10, 'USD', 100, 'paddle') $$, '23514', null, 'a top-up has no plan');
select throws_ok($$ insert into public.prices (id, kind, plan_id, region, period, currency, amount_minor, provider)
  values ('x_free_month', 'subscription', 'free', 'SA', 'month', 'USD', 100, 'paddle') $$, '23514', null, 'Free can''t be sold');
select throws_ok($$ insert into public.prices (id, kind, plan_id, region, period, currency, amount_minor, provider)
  values ('x_in_paddle', 'subscription', 'gold', 'IN', 'month', 'INR', 100, 'paddle') $$, '23514', null, 'India can''t pay through Paddle');
select throws_ok($$ insert into public.prices (id, kind, plan_id, region, country_code, period, currency, amount_minor, provider)
  values ('x_np_in_sea', 'subscription', 'gold', 'SEA', 'NP', 'month', 'USD', 100, 'paddle') $$, '23503', null,
  'a country override must be in its region');
select throws_ok($$ insert into public.prices (id, kind, plan_id, region, period, currency, amount_minor, provider)
  values ('x_sa_gold_again', 'subscription', 'gold', 'SA', 'month', 'USD', 500, 'paddle') $$, '23505', null,
  'one active price per offer and place');
select lives_ok($$ insert into public.prices (id, kind, plan_id, region, period, currency, amount_minor, provider, is_active)
  values ('x_sa_gold_old', 'subscription', 'gold', 'SA', 'month', 'USD', 500, 'paddle', false) $$,
  'an inactive price may sit beside the active one');

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-000000000001', 'buyer-a@prepora.test'),
  ('b0000000-0000-0000-0000-000000000002', 'buyer-b@prepora.test'),
  ('b0000000-0000-0000-0000-000000000003', 'admin@prepora.test');
update public.profiles set role = 'admin' where id = 'b0000000-0000-0000-0000-000000000003';
insert into public.subscriptions (user_id, plan_id, kind, price_id, provider, provider_subscription_id, current_period_end, currency, amount_minor) values
  ('b0000000-0000-0000-0000-000000000001', 'gold', 'subscription', 'in_gold_month', 'razorpay', 'sub_A', now() + interval '1 month', 'INR', 29900),
  ('b0000000-0000-0000-0000-000000000002', 'platinum', 'exam_pack', 'sa_platinum_exam_pack', 'paddle', 'txn_B', now() + interval '3 months', 'USD', 2199);

select throws_ok($$ insert into public.subscriptions (user_id, plan_id, kind, provider, provider_subscription_id, current_period_end, currency, amount_minor)
  values ('b0000000-0000-0000-0000-000000000001', 'gold', 'subscription', 'razorpay', 'sub_A', now() + interval '1 month', 'INR', 29900) $$,
  '23505', null, 'a provider subscription is stored once');
select throws_ok($$ insert into public.subscriptions (user_id, plan_id, kind, provider, provider_subscription_id, current_period_end)
  values ('b0000000-0000-0000-0000-000000000001', 'gold', 'subscription', 'paddle', 'sub_C', now() + interval '1 month') $$,
  '23514', null, 'a paid subscription records what it costs');
select lives_ok($$ insert into public.subscriptions (user_id, plan_id, kind, provider, current_period_end)
  values ('b0000000-0000-0000-0000-000000000002', 'gold', 'subscription', 'manual', now() + interval '1 month') $$,
  'a manual (support) subscription needs no provider id or price');

insert into public.payment_events (provider, event_id, event_type, payload)
values ('razorpay', 'evt_1', 'subscription.charged', '{"entity": "event"}');
select throws_ok($$ insert into public.payment_events (provider, event_id, event_type, payload)
  values ('razorpay', 'evt_1', 'subscription.charged', '{"entity": "event"}') $$, '23505', null, 'a webhook is stored once');
select lives_ok($$ insert into public.payment_events (provider, event_id, event_type, payload)
  values ('paddle', 'evt_1', 'transaction.completed', '{}') $$, 'event ids are unique per provider');

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────
set local role anon;
select is((select count(*) from public.prices where not is_active), 0::bigint, 'signed out: inactive prices are hidden');
select ok((select count(*) from public.prices) >= 34, 'signed out: active prices are readable');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select array_agg(provider_subscription_id) from public.subscriptions), array['sub_A'], 'a student sees only their own subscriptions');
select throws_ok($$ update public.subscriptions set plan_id = 'platinum' $$, '42501', null, 'a student can''t change their subscription');
select throws_ok($$ insert into public.prices (id, kind, region, credits, currency, amount_minor, provider)
  values ('x_cheap', 'topup', 'IN', 1000, 'INR', 1, 'razorpay') $$, '42501', null, 'a student can''t add a price');

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.subscriptions), 3::bigint, 'an admin sees every subscription');
select is((select count(*) from public.prices where id = 'x_sa_gold_old'), 1::bigint, 'an admin sees inactive prices');
select throws_ok($$ select * from public.payment_events $$, '42501', null, 'not even an admin reads raw webhooks');
reset role;

select * from finish();
rollback;
