-- M3-A1/A2: audit_log, plan and credit cost editing, a user's credits, grants and refunds.
-- Run: supabase test db
begin;
select plan(52);

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'boss@prepora.test'),
  ('ad000000-0000-0000-0000-000000000002', 'editor@prepora.test'),
  ('ad000000-0000-0000-0000-000000000003', 'student@prepora.test'),
  ('ad000000-0000-0000-0000-000000000004', 'other@prepora.test');
insert into public.profiles (id, full_name, role) values
  ('ad000000-0000-0000-0000-000000000001', 'Admin Boss', 'admin'),
  ('ad000000-0000-0000-0000-000000000002', 'Ed Itor', 'content_editor'),
  ('ad000000-0000-0000-0000-000000000003', 'Asha Rao', 'user'),
  ('ad000000-0000-0000-0000-000000000004', 'Ravi Kumar', 'user')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

-- The student spent 4 (writing_t2) and 4 (speaking_p2); the other user spent 4.
create temp table spends as
select 'student_w' as name, (public.spend_credits('ad000000-0000-0000-0000-000000000003', 'writing_t2') ->> 'reservation_id')::uuid as id
union all
select 'student_s', (public.spend_credits('ad000000-0000-0000-0000-000000000003', 'speaking_p2') ->> 'reservation_id')::uuid
union all
select 'other_w', (public.spend_credits('ad000000-0000-0000-0000-000000000004', 'writing_t2') ->> 'reservation_id')::uuid;
grant select on spends to authenticated;

-- ── Structure and privileges ──
select has_table('public', 'audit_log', 'audit_log exists');
select table_privs_are('public', 'audit_log', 'authenticated', array[]::text[], 'signed-in users have no table access to audit_log');
select table_privs_are('public', 'audit_log', 'anon', array[]::text[], 'anon has no access to audit_log');
select function_privs_are('public', 'write_audit', array['text', 'text', 'text', 'jsonb'], 'authenticated', array[]::text[],
  'write_audit is internal');
select function_privs_are('public', 'credits_summary', array['uuid'], 'authenticated', array[]::text[],
  'credits_summary is internal');
select function_privs_are('public', 'admin_grant_credits', array['uuid', 'integer', 'integer', 'text'], 'anon', array[]::text[],
  'anon can''t grant');
select function_privs_are('public', 'admin_update_plan', array['plan_tier', 'jsonb'], 'anon', array[]::text[],
  'anon can''t edit plans');
select function_privs_are('public', 'admin_audit_entries', array['text[]', 'text', 'integer'], 'anon', array[]::text[],
  'anon can''t read the audit log');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- ── Students and content editors are refused ──
select pg_temp.sign_in('ad000000-0000-0000-0000-000000000003');
select throws_ok($$ select public.admin_update_plan('free', (select limits from public.plans where id = 'free')) $$,
  '42501', 'admin only', 'a student can''t edit a plan');
select throws_ok($$ select public.admin_update_credit_cost('writing_t2', 0) $$, '42501', 'admin only',
  'a student can''t make an action free');
select throws_ok($$ select public.admin_grant_credits('ad000000-0000-0000-0000-000000000003', 100, null, 'gift to myself') $$,
  '42501', 'admin only', 'a student can''t grant themselves credits');
select throws_ok($$ select public.admin_refund_credits('ad000000-0000-0000-0000-000000000003',
    (select id from spends where name = 'student_w'), 'refund me') $$,
  '42501', 'admin only', 'a student can''t refund their own spend');
select throws_ok($$ select public.admin_user_credits('ad000000-0000-0000-0000-000000000004') $$, '42501', 'admin only',
  'a student can''t read another user''s credits');
select throws_ok($$ select * from public.admin_user_ledger('ad000000-0000-0000-0000-000000000004') $$, '42501', 'admin only',
  'a student can''t read another user''s ledger');
select throws_ok($$ select * from public.admin_audit_entries(array['user']) $$, '42501', 'admin only',
  'a student can''t read the audit log');
select throws_ok($$ select * from public.audit_log $$, '42501', null, 'a student can''t select from audit_log');
select throws_ok($$ select public.write_audit('plan.update', 'plan', 'free', '{}') $$, '42501', null,
  'a student can''t write audit rows');

select pg_temp.sign_in('ad000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.admin_update_credit_cost('writing_t2', 0) $$, '42501', 'admin only',
  'a content editor can''t change credit costs');
select throws_ok($$ select public.admin_grant_credits('ad000000-0000-0000-0000-000000000003', 5, null, 'support case') $$,
  '42501', 'admin only', 'a content editor can''t grant credits');

-- ── M3-A1 as the admin: plans ──
select pg_temp.sign_in('ad000000-0000-0000-0000-000000000001');

select is(
  public.admin_update_plan('free', (select limits from public.plans where id = 'free')
    || '{"monthly_credits": 10, "daily_credit_cap": 12}') ->> 'changed',
  '2', 'admin changes two Free limits');
select is((select limits ->> 'monthly_credits' from public.plans where id = 'free'), '10', 'monthly credits saved');
select is((select limits ->> 'daily_credit_cap' from public.plans where id = 'free'), '12', 'daily cap saved');
select is(
  (select details from public.admin_audit_entries(array['plan'], 'free') limit 1),
  '{"changes": {"daily_credit_cap": {"from": 8, "to": 12}, "monthly_credits": {"from": 8, "to": 10}}}'::jsonb,
  'the audit row has only the changed keys, before and after');
select is((select admin_name from public.admin_audit_entries(array['plan'], 'free') limit 1), 'Admin Boss',
  'the audit row names the admin');
select is((select (public.admin_user_credits('ad000000-0000-0000-0000-000000000003') ->> 'daily_cap')::int), 12,
  'the new daily cap applies at once');

select is(public.admin_update_plan('free', (select limits from public.plans where id = 'free')) ->> 'changed', '0',
  'saving unchanged limits changes nothing');
select is((select count(*)::int from public.admin_audit_entries(array['plan'], 'free')), 1, '… and writes no audit row');

select throws_ok($$ select public.admin_update_plan('gold', (select limits from public.plans where id = 'gold') - 'ocr') $$,
  '22023', 'invalid plan limits', 'a missing key is refused');
select throws_ok($$ select public.admin_update_plan('gold', (select limits from public.plans where id = 'gold') || '{"mock_tests": -1}') $$,
  '22023', 'invalid plan limits', 'a negative count is refused');
select throws_ok($$ select public.admin_update_plan('gold', (select limits from public.plans where id = 'gold') || '{"unlimited": true}') $$,
  '22023', 'invalid plan limits', 'an unknown key is refused');
select is((select limits ->> 'mock_tests' from public.plans where id = 'gold'), '2', 'refused edits leave the plan as it was');

-- ── M3-A1: credit costs ──
select is(public.admin_update_credit_cost('writing_t2', 5) ->> 'changed', 'true', 'admin sets Writing Task 2 to 5 credits');
select is((select credits from public.credit_costs where action_key = 'writing_t2'), 5, 'saved');
select is(
  (select details from public.admin_audit_entries(array['credit_cost'], 'writing_t2') limit 1),
  '{"changes": {"credits": {"from": 4, "to": 5}}}'::jsonb, 'audited with before and after');
select throws_ok($$ select public.admin_update_credit_cost('writing_t2', 1001) $$, '22023',
  'credits must be between 0 and 1000', 'over 1000 is refused');
select throws_ok($$ select public.admin_update_credit_cost('no_such_action', 3) $$, 'P0002', 'action not found',
  'an unknown action is refused');

-- ── M3-A2: a user's credits and ledger ──
select is((public.admin_user_credits('ad000000-0000-0000-0000-000000000003') ->> 'balance')::int, 10,
  'admin sees the student''s balance (18 − 4 − 4)');
create temp table admin_view as select public.admin_user_credits('ad000000-0000-0000-0000-000000000003') as j;
select pg_temp.sign_in('ad000000-0000-0000-0000-000000000003');
select is((select j from admin_view), public.get_my_credits(), 'the same CreditBalance the student gets');
select pg_temp.sign_in('ad000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.admin_user_credits('ad000000-0000-0000-0000-0000000000ff') $$, 'P0002', 'user not found',
  'an unknown user is reported');
select is((select array_agg(reason::text order by id desc) from public.admin_user_ledger('ad000000-0000-0000-0000-000000000003')),
  array['spend', 'spend', 'grant', 'grant'], 'the ledger, newest first');

-- ── M3-A2: grant ──
select throws_ok($$ select public.admin_grant_credits('ad000000-0000-0000-0000-000000000003', 5, null, '  ') $$,
  '22023', 'a note of 3 to 500 characters is required', 'a grant needs a note');
select throws_ok($$ select public.admin_grant_credits('ad000000-0000-0000-0000-000000000003', 0, null, 'support case') $$,
  '22023', 'amount must be between 1 and 1000 credits', 'zero credits is refused');
select throws_ok($$ select public.admin_grant_credits('ad000000-0000-0000-0000-000000000003', 5, 0, 'support case') $$,
  '22023', 'expiry must be 1 to 730 days, or never', 'an expiry of 0 days is refused');

select is((public.admin_grant_credits('ad000000-0000-0000-0000-000000000003', 20, 30, '  Scoring outage on 23 Nov  ') ->> 'balance_after')::int,
  30, 'admin grants 20 credits for 30 days');
select ok((select (b ->> 'granted')::int = 20 and (b ->> 'expires_at')::timestamptz between now() + interval '29 days' and now() + interval '31 days'
           from jsonb_array_elements(public.admin_user_credits('ad000000-0000-0000-0000-000000000003') -> 'buckets') b
           where b ->> 'source' = 'admin'),
  'as an admin bucket expiring in 30 days');
select is(
  (select details - 'bucket_id' - 'expires_at' from public.admin_audit_entries(array['user'], 'ad000000-0000-0000-0000-000000000003') limit 1),
  '{"amount": 20, "note": "Scoring outage on 23 Nov", "balance_after": 30}'::jsonb, 'audited with the trimmed note');

-- ── M3-A2: refund ──
select is(public.admin_refund_credits('ad000000-0000-0000-0000-000000000003', (select id from spends where name = 'student_w'),
  'Feedback was in the wrong language') ->> 'refunded', '4', 'admin refunds the Writing spend');
select is((select refunded from public.admin_user_ledger('ad000000-0000-0000-0000-000000000003')
           where reservation_id = (select id from spends where name = 'student_w') and reason = 'spend'),
  true, 'the ledger marks the spend as refunded');
select is(public.admin_refund_credits('ad000000-0000-0000-0000-000000000003', (select id from spends where name = 'student_w'),
  'clicked twice') ->> 'status', 'already_refunded', 'refunding again does nothing');
select is(public.admin_refund_credits('ad000000-0000-0000-0000-000000000003', (select id from spends where name = 'other_w'),
  'wrong user') ->> 'status', 'not_found', 'another user''s spend can''t be refunded from this user''s page');
select is((public.admin_user_credits('ad000000-0000-0000-0000-000000000004') ->> 'balance')::int, 14,
  '… and that user''s credits are untouched');
select is((select array_agg(action order by id desc) from public.admin_audit_entries(array['user'], 'ad000000-0000-0000-0000-000000000003')),
  array['credits.refund', 'credits.grant'], 'one audit row per real change (the repeat and the refused refund wrote none)');

select * from finish();
rollback;
