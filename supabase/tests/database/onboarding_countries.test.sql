-- M2-C1: profile onboarding fields, country_regions, waitlist final shape. Run: supabase test db
begin;
select plan(30);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'admin@example.com');
insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

-- ── Profiles: structure ─────────────────────────────────────────────────────────────────────
select has_column('public', 'profiles', 'test_type', 'profiles.test_type exists');
select has_column('public', 'profiles', 'target_band', 'profiles.target_band exists');
select has_column('public', 'profiles', 'exam_date', 'profiles.exam_date exists');
select enum_has_labels('public', 'ielts_test_type', array['academic', 'general'], 'ielts_test_type values');
select col_type_is('public', 'profiles', 'target_band', 'numeric(2,1)', 'target_band is numeric(2,1)');
select col_type_is('public', 'profiles', 'exam_date', 'date', 'exam_date is a date');

-- ── Profiles: the student fills them in ─────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ update public.profiles set test_type = 'academic', target_band = 7.5, exam_date = '2027-03-14'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'a user can set their test type, target band and exam date');
select lives_ok(
  $$ update public.profiles set exam_date = null where id = '11111111-1111-1111-1111-111111111111' $$,
  'the exam date can be cleared (skippable)');
select throws_ok(
  $$ update public.profiles set target_band = 7.3 where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'target band must be a half step');
select throws_ok(
  $$ update public.profiles set target_band = 9.5 where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'target band can''t exceed 9.0');
select throws_ok(
  $$ update public.profiles set target_band = 0.5 where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'target band can''t be below 1.0');
select throws_ok(
  $$ update public.profiles set exam_date = '1999-01-01' where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'absurd exam dates are rejected');
select throws_ok(
  $$ update public.profiles set test_type = 'computer' where id = '11111111-1111-1111-1111-111111111111' $$,
  '22P02', null, 'unknown test types are rejected');
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'role is still not user-editable');
select throws_ok(
  $$ update public.profiles set plan = 'gold' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'plan is still not user-editable');
reset role;

select is(
  (select test_type::text || '/' || target_band::text || '/' || coalesce(exam_date::text, 'none')
     from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'academic/7.5/none', 'onboarding answers were stored');

-- ── country_regions ─────────────────────────────────────────────────────────────────────────
select has_table('public', 'country_regions', 'country_regions exists');
select col_is_pk('public', 'country_regions', 'country_code', 'country_code is the primary key');
select enum_has_labels('public', 'market_region', array['IN', 'SA', 'SEA', 'EA', 'ANZ'], 'market_region values');
select col_default_is('public', 'country_regions', 'is_enabled', 'false', 'countries start disabled');
select ok((select relrowsecurity from pg_class where oid = 'public.country_regions'::regclass),
  'RLS is enabled on country_regions');

insert into public.country_regions (country_code, region, launch_wave, is_enabled) values
  ('IN', 'IN', 1, true), ('PH', 'SEA', 2, false);

set local role anon;
select is((select count(*)::int from public.country_regions), 2, 'anon can read country_regions');
select is((select is_enabled from public.country_regions where country_code = 'IN'), true,
  'anon sees which countries are enabled');
select throws_ok(
  $$ update public.country_regions set is_enabled = true where country_code = 'PH' $$,
  '42501', null, 'anon cannot enable a country');
reset role;

set local role authenticated;
select throws_ok(
  $$ insert into public.country_regions (country_code, region) values ('XX', 'SA') $$,
  '42501', null, 'signed-in users cannot add countries');
select throws_ok(
  $$ update public.country_regions set is_enabled = true where country_code = 'PH' $$,
  '42501', null, 'signed-in users cannot enable a country');
reset role;

select throws_ok(
  $$ insert into public.country_regions (country_code, region) values ('in', 'IN') $$,
  '23514', null, 'country codes must be two uppercase letters');

-- ── waitlist final shape ────────────────────────────────────────────────────────────────────
select has_column('public', 'waitlist', 'invited_by', 'waitlist.invited_by exists');
select has_column('public', 'waitlist', 'user_id', 'waitlist.user_id exists');
select throws_ok(
  $$ insert into public.waitlist (email, invited_by)
     values ('x@example.com', '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'invited_by needs invited_at');

select * from finish();
rollback;
