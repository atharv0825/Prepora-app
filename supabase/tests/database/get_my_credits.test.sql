-- M3-B5: get_my_credits(). Run: supabase test db
begin;
select plan(14);

insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'me@prepora.test'),
  ('e1000000-0000-0000-0000-000000000002', 'other@prepora.test');
insert into public.profiles (id, plan) values
  ('e1000000-0000-0000-0000-000000000001', 'free'),
  ('e1000000-0000-0000-0000-000000000002', 'gold')
on conflict (id) do update set plan = excluded.plan;

-- Activity for "me": a spend, a refunded spend, one reading test, an expired and an empty bucket.
select public.spend_credits('e1000000-0000-0000-0000-000000000001', 'writing_t2');
select public.refund_credits((public.spend_credits('e1000000-0000-0000-0000-000000000001', 'speaking_p2') ->> 'reservation_id')::uuid);
select public.use_allowance('e1000000-0000-0000-0000-000000000001', 'reading_tests');
insert into public.credit_buckets (user_id, source, granted, remaining, expires_at) values
  ('e1000000-0000-0000-0000-000000000001', 'topup', 5, 5, now() - interval '1 day'),
  ('e1000000-0000-0000-0000-000000000001', 'admin', 3, 0, null);

select function_privs_are('public', 'get_my_credits', array[]::text[], 'authenticated', array['EXECUTE'], 'signed-in users can call it');
select function_privs_are('public', 'get_my_credits', array[]::text[], 'anon', array[]::text[], 'signed-out visitors can''t');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

create temp table c as select public.get_my_credits() as j;

select is((select j ->> 'plan' from c), 'free', 'plan');
select is((select (j ->> 'balance')::int from c), 14, 'balance: 18 − 4 (the refunded spend gave its 4 back)');
select is((select (j ->> 'spent_today')::int from c), 4, 'spent today excludes the refunded spend');
select is((select (j ->> 'daily_cap')::int from c), 8, 'Free daily cap');
select results_eq(
  $$ select b ->> 'source', (b ->> 'remaining')::int, (b ->> 'granted')::int, b ->> 'expires_at' is null
     from c, jsonb_array_elements(j -> 'buckets') b $$,
  $$ values ('monthly', 4, 8, false), ('welcome', 10, 10, true) $$,
  'buckets: spendable only (no expired, no empty), soonest expiry first');
select is((select (j ->> 'balance')::int from c),
  (select sum((b ->> 'remaining')::int)::int from c, jsonb_array_elements(j -> 'buckets') b), 'balance = sum of listed buckets');
select is((select j ->> 'period_start' from c), date_trunc('month', now() at time zone 'UTC')::date::text, 'allowance period: this month (UTC)');
select is((select j -> 'allowances' from c),
  '[{"type": "reading_tests", "used": 1, "limit": 2}, {"type": "listening_tests", "used": 0, "limit": 2},
    {"type": "practice_sessions", "used": 0, "limit": 5}, {"type": "mock_tests", "used": 0, "limit": 0}]'::jsonb,
  'allowances: used and limit for all four, zero when unused');
select is((select array(select jsonb_object_keys(j) order by 1) from c),
  array['allowances', 'balance', 'buckets', 'daily_cap', 'period_start', 'plan', 'spent_today'],
  'exactly the CreditBalance fields');

-- Another user sees their own numbers (Gold limits), never mine.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(public.get_my_credits() ->> 'daily_cap', '40', 'another user gets their own plan''s cap');
select is((public.get_my_credits() ->> 'balance')::int, 18, '…and their own balance');

-- No session.
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.get_my_credits() $$, '42501', null, 'no session: refused');
reset role;

select * from finish();
rollback;
