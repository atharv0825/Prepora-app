-- M2-A2: admins toggle country_regions.is_enabled and read the waitlist. Run: supabase test db
begin;
select plan(18);

-- Only this test's waitlist rows and users (local databases may hold leftovers; rolled back).
delete from public.waitlist;
insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-000000000001', 'boss@prepora.test'),
  ('b0000000-0000-0000-0000-000000000002', 'editor@prepora.test'),
  ('b0000000-0000-0000-0000-000000000003', 'student@prepora.test');
insert into public.profiles (id, role) values
  ('b0000000-0000-0000-0000-000000000001', 'admin'),
  ('b0000000-0000-0000-0000-000000000002', 'content_editor'),
  ('b0000000-0000-0000-0000-000000000003', 'user')
on conflict (id) do update set role = excluded.role;
insert into public.waitlist (email, country_code, source, invited_at) values
  ('vn1@example.com', 'VN', 'hero', null),
  ('vn2@example.com', 'VN', 'signup_gate', null),
  ('ph1@example.com', 'PH', 'final_cta', null),
  ('ph2@example.com', 'PH', 'hero', now()),
  ('unknown@example.com', null, null, null);

-- Privileges
select column_privs_are('public', 'country_regions', 'is_enabled', 'authenticated', array['SELECT', 'UPDATE'],
  'authenticated may update is_enabled (RLS limits it to admins)');
select column_privs_are('public', 'country_regions', 'region', 'authenticated', array['SELECT'],
  'region is not updatable through the API');
select column_privs_are('public', 'country_regions', 'launch_wave', 'authenticated', array['SELECT'],
  'launch_wave is not updatable through the API');
select table_privs_are('public', 'waitlist', 'anon', array[]::text[], 'anon has no access to the waitlist');
select table_privs_are('public', 'waitlist', 'authenticated', array['SELECT'], 'authenticated: select only (RLS: admins)');
select function_privs_are('public', 'admin_waitlist_by_country', array[]::text[], 'anon', array[]::text[],
  'anon can''t call admin_waitlist_by_country');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- A student
select pg_temp.sign_in('b0000000-0000-0000-0000-000000000003');
select is((select count(*) from public.waitlist), 0::bigint, 'a student sees no waitlist rows');
select is((select count(*) from public.admin_waitlist_by_country()), 0::bigint, 'a student gets no counts');
update public.country_regions set is_enabled = true where country_code = 'VN';
select is((select is_enabled from public.country_regions where country_code = 'VN'), false,
  'a student can''t enable a country (no row updated)');

-- A content editor
select pg_temp.sign_in('b0000000-0000-0000-0000-000000000002');
select is((select count(*) from public.waitlist), 0::bigint, 'a content editor sees no waitlist rows');
update public.country_regions set is_enabled = true where country_code = 'VN';
select is((select is_enabled from public.country_regions where country_code = 'VN'), false,
  'a content editor can''t enable a country');

-- The admin
select pg_temp.sign_in('b0000000-0000-0000-0000-000000000001');
select is((select count(*) from public.waitlist), 5::bigint, 'the admin reads the whole waitlist');
select results_eq(
  $$ select country_code, waiting, invited from public.admin_waitlist_by_country() $$,
  $$ values ('VN'::text, 2::bigint, 0::bigint), ('PH', 1, 1), (null, 1, 0) $$,
  'counts per country: waiting first, unknown country last');

update public.country_regions set is_enabled = true where country_code = 'VN';
select is((select is_enabled from public.country_regions where country_code = 'VN'), true,
  'the admin enables Vietnam with one update');
select is(public.get_launch_status('VN'), 'enabled', '…and the country gate opens immediately');
update public.country_regions set is_enabled = false where country_code = 'VN';
select is(public.get_launch_status('VN'), 'waitlist', 'disabling closes it again');

select throws_ok($$ update public.country_regions set launch_wave = 1 where country_code = 'VN' $$, '42501',
  null, 'even the admin can''t change waves through the API');
select throws_ok($$ insert into public.waitlist (email) values ('x@example.com') $$, '42501',
  null, 'nobody inserts into the waitlist directly (join_waitlist only)');

reset role;
select * from finish();
rollback;
