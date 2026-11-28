-- M9-A1: admin subscriptions list, revenue by currency, a user's subscriptions, manual plan change.
-- Run: supabase test db
begin;
select plan(24);

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-000000000001', 'boss@prepora.test'),
  ('f0000000-0000-0000-0000-000000000002', 'asha_100%@prepora.test'),
  ('f0000000-0000-0000-0000-000000000003', 'ravi@prepora.test');
update public.profiles set role = 'admin' where id = 'f0000000-0000-0000-0000-000000000001';
update public.profiles set full_name = 'Asha' where id = 'f0000000-0000-0000-0000-000000000002';

-- Two paid purchases through the webhook path, one refunded.
select public.billing_apply_event((public.billing_record_event('razorpay', 'a1', 't', '{}') ->> 'id')::bigint,
  jsonb_build_object('action', 'payment_completed', 'user_id', 'f0000000-0000-0000-0000-000000000002', 'price_id', 'in_gold_month',
    'subscription_id', 'sub_A', 'payment_id', 'pay_A', 'amount_minor', 29900, 'currency', 'INR'));
select public.billing_apply_event((public.billing_record_event('paddle', 'a2', 't', '{}') ->> 'id')::bigint,
  jsonb_build_object('action', 'payment_completed', 'user_id', 'f0000000-0000-0000-0000-000000000003', 'price_id', 'sa_topup_150',
    'payment_id', 'txn_T', 'amount_minor', 499, 'currency', 'USD'));
select public.billing_apply_event((public.billing_record_event('paddle', 'a3', 't', '{}') ->> 'id')::bigint,
  '{"action":"refunded","payment_id":"txn_T","amount_minor":499}');
-- A stuck webhook.
select public.billing_record_event('paddle', 'a4', 't', '{}');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- ── Not for students ────────────────────────────────────────────────────────────────────────
select pg_temp.as_user('f0000000-0000-0000-0000-000000000002');
select throws_ok($$ select * from public.admin_list_subscriptions() $$, '42501', null, 'a student can''t list subscriptions');
select throws_ok($$ select public.admin_billing_summary() $$, '42501', null, 'a student can''t see revenue');
select throws_ok($$ select public.admin_set_manual_plan('f0000000-0000-0000-0000-000000000002', 'platinum', 30, true, 'please') $$,
  '42501', null, 'a student can''t give themselves a plan');

-- ── Admin ───────────────────────────────────────────────────────────────────────────────────
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select is((select count(*) from public.admin_list_subscriptions()), 1::bigint, 'lists the subscriptions');
select is((select email from public.admin_list_subscriptions()), 'asha_100%@prepora.test', 'with the student''s email');
select is((select count(*) from public.admin_list_subscriptions(p_search => 'ASHA')), 1::bigint, 'search by name, any case');
select is((select count(*) from public.admin_list_subscriptions(p_search => '100%')), 1::bigint, '% is matched literally');
select is((select count(*) from public.admin_list_subscriptions(p_search => '1_0')), 0::bigint, '_ is matched literally');
select is((select count(*) from public.admin_list_subscriptions(p_status => 'past_due')), 0::bigint, 'status filter');

select is(public.admin_billing_summary() -> 'revenue' -> 0 ->> 'currency', 'INR', 'revenue per currency, sorted');
select is((public.admin_billing_summary() -> 'revenue' -> 0 ->> 'net_minor')::int, 29900, 'INR net');
select is((public.admin_billing_summary() -> 'revenue' -> 1 ->> 'refunded_minor')::int, 499, 'USD refunded');
select is((public.admin_billing_summary() -> 'revenue' -> 1 ->> 'net_minor')::int, 0, 'a refunded payment isn''t net revenue');
select is((public.admin_billing_summary() -> 'active' ->> 'gold')::int, 1, 'live Gold subscriptions');
select is((public.admin_billing_summary() ->> 'unprocessed_events')::int, 1, 'stuck webhooks are counted');

select is((select count(*) from public.admin_user_subscriptions('f0000000-0000-0000-0000-000000000002')), 1::bigint, 'one user''s subscriptions');

-- Manual plan change
select throws_ok($$ select public.admin_set_manual_plan('f0000000-0000-0000-0000-000000000003', 'gold', 30, false, '') $$,
  '22023', null, 'a note is required');
select throws_ok($$ select public.admin_set_manual_plan('f0000000-0000-0000-0000-000000000003', 'gold', 400, false, 'ticket 12') $$,
  '22023', null, 'at most 366 days');
select is(public.admin_set_manual_plan('f0000000-0000-0000-0000-000000000003', 'platinum', 30, true, 'ticket 12: paid by bank transfer') ->> 'plan_after',
  'platinum', 'manual Platinum');
reset role;
select is((select sum(remaining) from public.credit_buckets where user_id = 'f0000000-0000-0000-0000-000000000003' and source = 'admin'),
  220::bigint, 'with Platinum''s monthly credits');
select is((select action from public.audit_log where entity_id = 'f0000000-0000-0000-0000-000000000003' order by id desc limit 1),
  'plan.manual_change', 'audited');
set local role authenticated;
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select is(public.admin_set_manual_plan('f0000000-0000-0000-0000-000000000003', 'gold', 10, false, 'ticket 12: wrong plan') ->> 'plan_after',
  'gold', 'a new manual plan replaces the old one');
select is(public.admin_set_manual_plan('f0000000-0000-0000-0000-000000000003', 'free', null, false, 'ticket 12: ended') ->> 'plan_after',
  'free', 'free ends manual plans');
select is(public.admin_set_manual_plan('f0000000-0000-0000-0000-000000000002', 'free', null, false, 'ticket 13') ->> 'plan_after',
  'gold', 'a provider subscription is left alone (the student stays Gold)');

reset role;
select * from finish();
rollback;
