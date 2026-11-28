-- Exam pack upgrade (Gold pack → Platinum pack for the days left): billing_apply_event.
-- Run: supabase test db
begin;
select plan(9);

insert into auth.users (id, email) values ('a7000000-0000-0000-0000-000000000001', 'pack-up@prepora.test');

create function pg_temp.ev(p_id text, p_event jsonb) returns jsonb language sql as $$
  select public.billing_apply_event((public.billing_record_event('razorpay', p_id, 't', '{}') ->> 'id')::bigint, p_event)
$$;

select pg_temp.ev('u1', '{"action":"payment_completed","user_id":"a7000000-0000-0000-0000-000000000001","price_id":"in_gold_exam_pack","order_id":"order_P","payment_id":"pay_P"}');
select is((select plan::text from public.profiles where id = 'a7000000-0000-0000-0000-000000000001'), 'gold', 'a Gold pack');
select is((select sum(remaining) from public.credit_buckets where user_id = 'a7000000-0000-0000-0000-000000000001' and source = 'exam_pack'), 300::bigint, 'with 300 credits');

select is(pg_temp.ev('u2', jsonb_build_object('action', 'payment_completed', 'user_id', 'a7000000-0000-0000-0000-000000000001',
  'price_id', 'in_platinum_exam_pack', 'order_id', 'order_U', 'payment_id', 'pay_U', 'amount_minor', 60000, 'currency', 'INR',
  'upgrade_of', (select id from public.subscriptions where provider_subscription_id = 'order_P'), 'upgrade_credits', '240')) ->> 'result',
  'pack_upgraded', 'the upgrade payment upgrades the pack');
select is((select plan_id::text from public.subscriptions where provider_subscription_id = 'order_P'), 'platinum', 'the same pack is now Platinum');
select is((select count(*) from public.subscriptions where user_id = 'a7000000-0000-0000-0000-000000000001'), 1::bigint, 'no second pack');
select ok((select current_period_end between now() + interval '89 days' and now() + interval '93 days' from public.subscriptions where provider_subscription_id = 'order_P'), 'the end date is kept');
select is((select plan::text from public.profiles where id = 'a7000000-0000-0000-0000-000000000001'), 'platinum', 'the profile is Platinum');
select is((select sum(remaining) from public.credit_buckets where user_id = 'a7000000-0000-0000-0000-000000000001' and source = 'exam_pack'), 540::bigint, '+240 prorated credits');

select pg_temp.ev('u3', jsonb_build_object('action', 'payment_completed', 'user_id', 'a7000000-0000-0000-0000-000000000001',
  'price_id', 'in_platinum_exam_pack', 'order_id', 'order_V', 'payment_id', 'pay_V',
  'upgrade_of', (select id from public.subscriptions where provider_subscription_id = 'order_P'), 'upgrade_credits', '99999'));
select is((select sum(remaining) from public.credit_buckets where user_id = 'a7000000-0000-0000-0000-000000000001' and source = 'exam_pack'), 1200::bigint,
  'credits from metadata are capped at the new pack''s credits (660)');

select * from finish();
rollback;
