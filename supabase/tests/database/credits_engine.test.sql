-- M3-B1…B4: spend_credits, refund_credits, use_allowance, grants and maintenance.
-- Runs as the owner (like the service role). Concurrency is M3-B7. Run: supabase test db
begin;
select plan(62);

-- Three users: Free with a profile, Gold, and Free without a profile row (M1-B2 not built).
-- Inserting into auth.users fires the sign-up grant.
insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'free@prepora.test'),
  ('d0000000-0000-0000-0000-000000000002', 'gold@prepora.test'),
  ('d0000000-0000-0000-0000-000000000003', 'noprofile@prepora.test');
insert into public.profiles (id, plan) values
  ('d0000000-0000-0000-0000-000000000001', 'free'),
  ('d0000000-0000-0000-0000-000000000002', 'gold')
on conflict (id) do update set plan = excluded.plan;

create function pg_temp.bal(p uuid) returns integer language sql as $$ select public.credit_balance(p) $$;

-- ── Privileges: service role only ───────────────────────────────────────────────────────────
select function_privs_are('public', 'spend_credits', array['uuid', 'text', 'uuid'], 'authenticated', array[]::text[],
  'users can''t call spend_credits');
select function_privs_are('public', 'refund_credits', array['uuid'], 'authenticated', array[]::text[],
  'users can''t call refund_credits');
select function_privs_are('public', 'use_allowance', array['uuid', 'text'], 'authenticated', array[]::text[],
  'users can''t call use_allowance');
select function_privs_are('public', 'grant_credits', array['uuid', 'credit_source', 'integer', 'timestamp with time zone'], 'authenticated', array[]::text[],
  'users can''t call grant_credits');
select function_privs_are('public', 'run_credit_maintenance', array[]::text[], 'authenticated', array[]::text[],
  'users can''t run maintenance');
select function_privs_are('public', 'spend_credits', array['uuid', 'text', 'uuid'], 'anon', array[]::text[],
  'anon can''t call spend_credits');
select function_privs_are('public', 'spend_credits', array['uuid', 'text', 'uuid'], 'service_role', array['EXECUTE'],
  'the service role can call spend_credits');
select function_privs_are('public', 'refund_credits', array['uuid'], 'service_role', array['EXECUTE'],
  'the service role can call refund_credits');
select function_privs_are('public', 'use_allowance', array['uuid', 'text'], 'service_role', array['EXECUTE'],
  'the service role can call use_allowance');

-- ── M3-B4: sign-up grant ────────────────────────────────────────────────────────────────────
select is(pg_temp.bal('d0000000-0000-0000-0000-000000000001'), 18, 'a new Free user starts with 18 credits');
select is(pg_temp.bal('d0000000-0000-0000-0000-000000000003'), 18, '…also without a profile row');
select results_eq(
  $$ select source::text, granted, expires_at is null from public.credit_buckets
     where user_id = 'd0000000-0000-0000-0000-000000000001' order by source $$,
  $$ values ('monthly', 8, false), ('welcome', 10, true) $$,
  'buckets: 8 monthly (expiring) + 10 welcome (never expires)');
select ok((select expires_at between now() + interval '27 days' and now() + interval '32 days'
           from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000001' and source = 'monthly'),
  'the monthly bucket lasts one month');
select is((select count(*) from public.credit_ledger where user_id = 'd0000000-0000-0000-0000-000000000001' and reason = 'grant'),
  2::bigint, 'two grant ledger entries');
select public.grant_signup_credits('d0000000-0000-0000-0000-000000000001');
select is(pg_temp.bal('d0000000-0000-0000-0000-000000000001'), 18, 'the sign-up grant happens once');
select ok(exists (select 1 from cron.job where jobname = 'prepora-credit-maintenance' and schedule = '7 * * * *'),
  'maintenance is scheduled hourly');

-- ── M3-B1: spend ────────────────────────────────────────────────────────────────────────────
create temp table r (name text primary key, res jsonb);
insert into r values ('w2', public.spend_credits('d0000000-0000-0000-0000-000000000001', 'writing_t2', 'e0000000-0000-0000-0000-000000000001'));
select is((select res - 'reservation_id' from r where name = 'w2'),
  '{"ok": true, "action_key": "writing_t2", "credits": 4, "balance_after": 14, "spent_today": 4}'::jsonb,
  'spend: 4 credits, 14 left, 4 spent today');
select ok((select (res ->> 'reservation_id')::uuid is not null from r where name = 'w2'), 'spend returns a reservation id');
select results_eq(
  $$ select source::text, remaining from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000001' order by source $$,
  $$ values ('monthly', 4), ('welcome', 10) $$,
  'taken from the bucket that expires first (monthly), welcome untouched');
select results_eq(
  $$ select delta, reason::text, action_key, ref_id from public.credit_ledger
     where reservation_id = (select (res ->> 'reservation_id')::uuid from r where name = 'w2') $$,
  $$ values (-4, 'spend', 'writing_t2', 'e0000000-0000-0000-0000-000000000001'::uuid) $$,
  'the ledger records the spend with action, ref and reservation');

insert into r values ('s2', public.spend_credits('d0000000-0000-0000-0000-000000000001', 'speaking_p2'));
select is((select res ->> 'spent_today' from r where name = 's2'), '8', 'second spend reaches the Free cap (8)');
select is(public.spend_credits('d0000000-0000-0000-0000-000000000001', 'writing_t1'),
  '{"ok": false, "code": "daily_cap_reached", "action_key": "writing_t1", "credits": 4, "daily_cap": 8, "spent_today": 8}'::jsonb,
  'third spend today: daily_cap_reached (balance 10 is fine)');
select is(pg_temp.bal('d0000000-0000-0000-0000-000000000001'), 10, 'a refused spend takes nothing');

select is(public.spend_credits('d0000000-0000-0000-0000-000000000001', 'ocr'),
  '{"ok": false, "code": "feature_not_in_plan", "action_key": "ocr", "credits": 1, "feature": "ocr"}'::jsonb,
  'Free can''t use OCR: feature_not_in_plan');
select is((public.spend_credits('d0000000-0000-0000-0000-000000000002', 'ocr') ->> 'ok')::boolean, true, 'Gold can use OCR');
select is(public.spend_credits('d0000000-0000-0000-0000-000000000002', 'gen_cue_card') ->> 'code', 'feature_not_in_plan',
  'Gold can''t use AI generation');

-- Insufficient credits (user without profile, balance reduced to 2).
update public.credit_buckets set remaining = 0 where user_id = 'd0000000-0000-0000-0000-000000000003' and source = 'monthly';
update public.credit_buckets set remaining = 2 where user_id = 'd0000000-0000-0000-0000-000000000003' and source = 'welcome';
select is(public.spend_credits('d0000000-0000-0000-0000-000000000003', 'writing_t2'),
  '{"ok": false, "code": "insufficient_credits", "action_key": "writing_t2", "credits": 4, "balance": 2}'::jsonb,
  'insufficient_credits with the balance');

-- Expired buckets aren't spendable even before the expiry job runs.
insert into public.credit_buckets (user_id, source, granted, remaining, expires_at)
values ('d0000000-0000-0000-0000-000000000003', 'topup', 5, 5, now() - interval '1 hour');
select is(pg_temp.bal('d0000000-0000-0000-0000-000000000003'), 2, 'an expired bucket doesn''t count');
select is(public.spend_credits('d0000000-0000-0000-0000-000000000003', 'writing_t2') ->> 'code', 'insufficient_credits',
  '…and can''t be spent');

-- Spending across buckets, soonest expiry first (Gold: topup in 5 days, monthly in a month, welcome never).
select public.grant_credits('d0000000-0000-0000-0000-000000000002', 'topup', 3, now() + interval '5 days');
insert into r values ('p3', public.spend_credits('d0000000-0000-0000-0000-000000000002', 'speaking_p3'));
select results_eq(
  $$ select b.source::text, -l.delta from public.credit_ledger l join public.credit_buckets b on b.id = l.bucket_id
     where l.reservation_id = (select (res ->> 'reservation_id')::uuid from r where name = 'p3') order by l.id $$,
  $$ values ('topup', 3), ('monthly', 3) $$,
  'one spend across two buckets: the topup (expires first), then monthly');

select throws_ok($$ select public.spend_credits('d0000000-0000-0000-0000-000000000001', 'speaking_full') $$, '22023', null,
  'unknown action raises');
select throws_ok($$ select public.spend_credits('d0000000-0000-0000-0000-00000000dead', 'writing_t2') $$, '22023', null,
  'unknown user raises');

-- ── M3-B2: refund ───────────────────────────────────────────────────────────────────────────
select is((public.refund_credits((select (res ->> 'reservation_id')::uuid from r where name = 's2')) - 'reservation_id'),
  '{"ok": true, "status": "refunded", "refunded": 4, "balance_after": 14}'::jsonb,
  'refund puts the 4 credits back');
select results_eq(
  $$ select source::text, remaining from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000001' order by source $$,
  $$ values ('monthly', 4), ('welcome', 10) $$,
  '…into the bucket they came from');
select is(public.credits_spent_today('d0000000-0000-0000-0000-000000000001'), 4, 'a refunded spend no longer counts toward the cap');
select is((public.spend_credits('d0000000-0000-0000-0000-000000000001', 'writing_t1') ->> 'ok')::boolean, true,
  'so the student can try again today');
select is(public.refund_credits((select (res ->> 'reservation_id')::uuid from r where name = 's2')) ->> 'status', 'already_refunded',
  'refund is idempotent');
select is(pg_temp.bal('d0000000-0000-0000-0000-000000000001'), 10, '…and gives nothing twice');
select is(public.refund_credits('f0000000-0000-0000-0000-000000000000') ->> 'status', 'not_found', 'unknown reservation: not_found');
select is((public.refund_credits((select (res ->> 'reservation_id')::uuid from r where name = 'p3')) ->> 'refunded')::int, 6,
  'a multi-bucket spend refunds in full');
select results_eq(
  $$ select source::text, remaining from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000002' and source in ('topup', 'monthly') order by source $$,
  $$ values ('monthly', 7), ('topup', 3) $$,
  '…each bucket gets back exactly what it gave (the earlier OCR spend stays spent)');

-- ── M3-B3: allowance ────────────────────────────────────────────────────────────────────────
select is(public.use_allowance('d0000000-0000-0000-0000-000000000001', 'reading_tests'),
  '{"ok": true, "type": "reading_tests", "used": 1, "limit": 2}'::jsonb, 'first Free reading test');
select is(public.use_allowance('d0000000-0000-0000-0000-000000000001', 'reading_tests') ->> 'used', '2', 'second');
select is(public.use_allowance('d0000000-0000-0000-0000-000000000001', 'reading_tests'),
  '{"ok": false, "code": "allowance_exceeded", "type": "reading_tests", "used": 2, "limit": 2}'::jsonb, 'third: allowance_exceeded');
select is(public.use_allowance('d0000000-0000-0000-0000-000000000001', 'listening_tests') ->> 'used', '1',
  'allowances are counted separately');
select is(public.use_allowance('d0000000-0000-0000-0000-000000000001', 'mock_tests') ->> 'code', 'allowance_exceeded',
  'Free has no mock tests');
select is(public.use_allowance('d0000000-0000-0000-0000-000000000002', 'mock_tests') ->> 'limit', '2', 'Gold has 2 mock tests');
select is((select period_start from public.usage_allowance where user_id = 'd0000000-0000-0000-0000-000000000001'),
  date_trunc('month', now() at time zone 'UTC')::date, 'counted in the current calendar month (UTC)');
select throws_ok($$ select public.use_allowance('d0000000-0000-0000-0000-000000000001', 'speaking_tests') $$, '22023', null,
  'unknown allowance type raises');

-- ── M3-B4: maintenance ──────────────────────────────────────────────────────────────────────
-- Free user's monthly bucket ran out; Gold user's too (paid plans are granted by billing, M9).
update public.credit_buckets set expires_at = now() - interval '1 minute', created_at = now() - interval '31 days'
where user_id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002') and source = 'monthly';
select is(public.run_credit_maintenance() ->> 'status', 'ok', 'maintenance runs');

select is((select remaining from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000003' and source = 'topup'),
  0, 'an expired bucket is zeroed');
select is((select delta from public.credit_ledger l join public.credit_buckets b on b.id = l.bucket_id
           where b.user_id = 'd0000000-0000-0000-0000-000000000003' and b.source = 'topup' and l.reason = 'expire'),
  -5, '…with an expire ledger entry');
select is((select count(*) from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000001'
           and source = 'monthly' and expires_at > now()), 1::bigint, 'the Free user gets a fresh monthly bucket');
select is((select granted from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000001'
           and source = 'monthly' and expires_at > now()), 8, '…of 8 credits');
select is((select count(*) from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000002'
           and source = 'monthly' and expires_at > now()), 0::bigint, 'a Gold user gets no Free grant');
select is(pg_temp.bal('d0000000-0000-0000-0000-000000000001'), 10 + 8, 'Free balance: welcome 10 (untouched, spent last) + new 8');
select is((select remaining from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000002'
           and source = 'monthly' and expires_at <= now()), 0, 'leftover monthly credits don''t roll over: Gold''s 7 expired');
select is((select l.delta from public.credit_ledger l join public.credit_buckets b on b.id = l.bucket_id
           where b.user_id = 'd0000000-0000-0000-0000-000000000002' and b.source = 'monthly' and l.reason = 'expire'),
  -7, '…recorded as an expire entry');

select public.run_credit_maintenance();
select is((select count(*) from public.credit_buckets where user_id = 'd0000000-0000-0000-0000-000000000001' and source = 'monthly'),
  2::bigint, 'running again grants nothing more');

select throws_ok($$ select public.grant_credits('d0000000-0000-0000-0000-000000000001', 'admin', 0) $$, '22023', null,
  'grants must be positive');
select throws_ok($$ select public.grant_credits('d0000000-0000-0000-0000-000000000001', 'admin', 5, now() - interval '1 day') $$, '22023', null,
  'grants can''t be already expired');

-- ── Invariant: the ledger explains every bucket ────────────────────────────────────────────
select is(
  (select count(*) from public.credit_buckets b
   where b.user_id::text like 'd0000000-%'
     and b.remaining <> (select coalesce(sum(l.delta), 0) from public.credit_ledger l where l.bucket_id = b.id)),
  3::bigint,
  'ledger sum = remaining for every bucket except the three set up directly in this test');

select * from finish();
rollback;
