-- M3-C1: plans & credits schema, constraints and RLS. Run: supabase test db
begin;
select plan(46);

-- ── Structure ───────────────────────────────────────────────────────────────────────────────
select has_table('public', t, t || ' exists')
from unnest(array['plans', 'credit_costs', 'credit_buckets', 'credit_ledger', 'usage_allowance', 'ai_usage']) as t;

select enum_has_labels('public', 'credit_source', array['monthly', 'welcome', 'exam_pack', 'topup', 'admin'], 'credit_source values');
select enum_has_labels('public', 'credit_ledger_reason', array['grant', 'spend', 'refund', 'expire', 'admin_adjust'], 'credit_ledger_reason values');
select col_is_pk('public', 'usage_allowance', array['user_id', 'period_start'], 'usage_allowance: one row per user and period');

-- RLS on everywhere
select ok((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ': RLS enabled')
from unnest(array['plans', 'credit_costs', 'credit_buckets', 'credit_ledger', 'usage_allowance', 'ai_usage']) as t;

-- ── Privileges: no client writes anywhere ───────────────────────────────────────────────────
select table_privs_are('public', 'plans', 'anon', array['SELECT'], 'anon: read plans');
select table_privs_are('public', 'credit_costs', 'anon', array['SELECT'], 'anon: read credit_costs');
select table_privs_are('public', 'plans', 'authenticated', array['SELECT'], 'authenticated: read plans only');
select table_privs_are('public', 'credit_costs', 'authenticated', array['SELECT'], 'authenticated: read credit_costs only');
select table_privs_are('public', 'credit_buckets', 'authenticated', array['SELECT'], 'authenticated: read buckets only');
select table_privs_are('public', 'credit_ledger', 'authenticated', array['SELECT'], 'authenticated: read ledger only');
select table_privs_are('public', 'usage_allowance', 'authenticated', array['SELECT'], 'authenticated: read allowance only');
select table_privs_are('public', 'ai_usage', 'authenticated', array[]::text[], 'authenticated: no access to ai_usage');
select table_privs_are('public', 'credit_buckets', 'anon', array[]::text[], 'anon: no access to buckets');
select table_privs_are('public', 'ai_usage', 'anon', array[]::text[], 'anon: no access to ai_usage');

-- ── plans.limits contract ───────────────────────────────────────────────────────────────────
select ok(public.plan_limits_valid((select limits from public.plans where id = 'gold')), 'seeded limits are valid');
select ok(not public.plan_limits_valid((select limits from public.plans where id = 'gold') - 'ocr'), 'a missing key is invalid');
select ok(not public.plan_limits_valid((select limits from public.plans where id = 'gold') || '{"unlimited": true}'), 'an unknown key is invalid');
select ok(not public.plan_limits_valid(jsonb_set((select limits from public.plans where id = 'gold'), '{monthly_credits}', '-1')), 'a negative count is invalid');
select ok(not public.plan_limits_valid(jsonb_set((select limits from public.plans where id = 'gold'), '{daily_credit_cap}', '2.5')), 'a fractional count is invalid');
select ok(not public.plan_limits_valid(jsonb_set((select limits from public.plans where id = 'gold'), '{ocr}', '"yes"')), 'a non-boolean flag is invalid');
select throws_ok($$ update public.plans set limits = limits - 'mock_tests' where id = 'free' $$, '23514', null,
  'the table rejects invalid limits');

-- ── Constraints ─────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-000000000001', 'a@prepora.test'),
  ('c0000000-0000-0000-0000-000000000002', 'b@prepora.test');
insert into public.credit_buckets (id, user_id, source, granted, remaining, expires_at) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'welcome', 10, 10, null),
  ('c1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'monthly', 8, 8, now() + interval '30 days');
insert into public.credit_ledger (user_id, bucket_id, delta, reason) values
  ('c0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 10, 'grant'),
  ('c0000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 8, 'grant');
insert into public.usage_allowance (user_id, period_start, reading_tests_used) values
  ('c0000000-0000-0000-0000-000000000001', '2026-11-01', 1),
  ('c0000000-0000-0000-0000-000000000002', '2026-11-01', 2);
insert into public.ai_usage (user_id, action_key, model, success) values
  ('c0000000-0000-0000-0000-000000000001', 'writing_t2', 'gemini-3.8-flash', true);

select throws_ok($$ update public.credit_buckets set remaining = -1 where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a bucket can''t go below 0');
select throws_ok($$ update public.credit_buckets set remaining = 11 where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a bucket can''t hold more than it was granted');
select throws_ok($$ insert into public.credit_ledger (user_id, delta, reason) values ('c0000000-0000-0000-0000-000000000001', 4, 'spend') $$,
  '23514', null, 'a spend must be negative');
select throws_ok($$ insert into public.credit_ledger (user_id, delta, reason) values ('c0000000-0000-0000-0000-000000000001', -4, 'refund') $$,
  '23514', null, 'a refund must be positive');
select throws_ok($$ insert into public.credit_ledger (user_id, delta, reason) values ('c0000000-0000-0000-0000-000000000001', 0, 'admin_adjust') $$,
  '23514', null, 'a ledger entry can''t be zero');
select lives_ok($$ insert into public.credit_ledger (user_id, delta, reason) values ('c0000000-0000-0000-0000-000000000001', -2, 'admin_adjust') $$,
  'an admin adjustment may be negative');
select throws_ok($$ insert into public.credit_ledger (user_id, delta, reason, action_key) values ('c0000000-0000-0000-0000-000000000001', -4, 'spend', 'no_such_action') $$,
  '23503', null, 'action_key must exist in credit_costs');

-- ── RLS as a signed-in user ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.credit_buckets), 1::bigint, 'a user sees only their own bucket');
select is((select count(*) from public.credit_ledger where user_id = 'c0000000-0000-0000-0000-000000000002'), 0::bigint,
  'a user can''t see someone else''s ledger');
select is((select reading_tests_used from public.usage_allowance), 1, 'a user sees only their own allowance');
select is((select count(*) from public.plans), 3::bigint, 'a user can read the plans');
select throws_ok($$ update public.credit_buckets set remaining = 10 where user_id = 'c0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a user can''t change their own balance');
select throws_ok($$ insert into public.credit_ledger (user_id, delta, reason) values ('c0000000-0000-0000-0000-000000000001', 100, 'grant') $$,
  '42501', null, 'a user can''t grant themselves credits');
select throws_ok($$ select * from public.ai_usage $$, '42501', null, 'a user can''t read ai_usage');
reset role;

select * from finish();
rollback;
