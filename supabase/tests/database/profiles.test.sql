-- M1-C1: profiles structure, RLS and column privileges. Run: supabase test db
begin;
select plan(26);

-- Two users. Profiles are inserted as the table owner; once M1-B2's trigger exists it creates
-- them first, hence "on conflict do nothing".
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
insert into public.profiles (id, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'User A'),
  ('22222222-2222-2222-2222-222222222222', 'User B')
on conflict (id) do nothing;
update public.profiles set full_name = 'User B'
  where id = '22222222-2222-2222-2222-222222222222';
-- Backdate so the updated_at check below can see a change (now() is fixed inside a transaction).
alter table public.profiles disable trigger profiles_validate;
update public.profiles set updated_at = '2000-01-01';
alter table public.profiles enable trigger profiles_validate;

-- Structure
select has_table('public', 'profiles', 'profiles table exists');
select columns_are('public', 'profiles',
  array['id', 'full_name', 'role', 'plan', 'country_code', 'timezone', 'created_at', 'updated_at',
        'test_type', 'target_band', 'exam_date'], -- onboarding fields: M2-C1
  'profiles has the contract columns');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles');
select col_default_is('public', 'profiles', 'role', 'user'::public.app_role, 'role defaults to user');
select col_default_is('public', 'profiles', 'plan', 'free'::public.plan_tier, 'plan defaults to free');
select enum_has_labels('public', 'app_role', array['user', 'admin', 'content_editor'], 'app_role values');
select enum_has_labels('public', 'plan_tier', array['free', 'gold', 'platinum'], 'plan_tier values');
select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id', 'profiles.id references auth.users');

-- anon: no access
set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
reset role;

-- Signed in as user A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'A sees exactly one profile');
select is((select full_name from public.profiles), 'User A', 'and it is their own');
select is_empty(
  $$ select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222' $$,
  'A cannot read B''s profile');

select lives_ok(
  $$ update public.profiles set full_name = 'Alice', country_code = 'IN', timezone = 'Asia/Kolkata'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'A can update their own name, country and timezone');
select is_empty(
  $$ update public.profiles set full_name = 'Hacked'
     where id = '22222222-2222-2222-2222-222222222222' returning 1 $$,
  'A updating B''s row changes nothing');

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'A cannot change their own role');
select throws_ok(
  $$ update public.profiles set plan = 'platinum' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'A cannot change their own plan');
select throws_ok(
  $$ update public.profiles set id = '33333333-3333-3333-3333-333333333333'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'A cannot change their id');
select throws_ok(
  $$ insert into public.profiles (id) values ('33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'users cannot insert profiles');
select throws_ok(
  $$ delete from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'users cannot delete profiles');
select throws_ok(
  $$ update public.profiles set timezone = 'Mars/Olympus' where id = '11111111-1111-1111-1111-111111111111' $$,
  '22023', 'invalid timezone: Mars/Olympus', 'unknown time zones are rejected');
select throws_ok(
  $$ update public.profiles set country_code = 'in' where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'country code must be two uppercase letters');
select throws_ok(
  $$ update public.profiles set full_name = '   ' where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'blank names are rejected');

reset role;

-- Checked as the table owner
select is(
  (select full_name || '/' || role || '/' || plan || '/' || country_code || '/' || timezone
     from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice/user/free/IN/Asia/Kolkata', 'A''s allowed changes were saved, role and plan untouched');
select is(
  (select full_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'User B', 'B''s profile is unchanged');
select ok(
  (select updated_at > '2000-01-01' from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'updated_at moves on update');

delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select is_empty(
  $$ select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222' $$,
  'deleting the auth user deletes the profile');

select * from finish();
rollback;
