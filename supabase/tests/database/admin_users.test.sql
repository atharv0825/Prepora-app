-- M2-A1: is_admin(), admin_list_users(), admin_get_user(). Run: supabase test db
begin;
select plan(27);

-- An admin, a content editor and three students. Profiles are inserted as the table owner; once
-- M1-B2's trigger exists it creates them first, hence "on conflict".
insert into auth.users (id, email, last_sign_in_at, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'boss@prepora.test', '2026-11-20 10:00+00', '{"provider":"google"}'),
  ('a0000000-0000-0000-0000-000000000002', 'editor@prepora.test', null, '{"provider":"google"}'),
  ('a0000000-0000-0000-0000-000000000003', 'asha.rao@example.com', null, '{"provider":"google"}'),
  ('a0000000-0000-0000-0000-000000000004', 'ravi@example.com', null, '{"provider":"google"}'),
  ('a0000000-0000-0000-0000-000000000005', 'odd_100%@example.com', null, '{"provider":"google"}');
insert into public.profiles (id, full_name, role, plan, country_code, created_at) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin Boss', 'admin', 'free', 'IN', '2026-11-01'),
  ('a0000000-0000-0000-0000-000000000002', 'Ed Itor', 'content_editor', 'free', 'IN', '2026-11-02'),
  ('a0000000-0000-0000-0000-000000000003', 'Asha Rao', 'user', 'gold', 'IN', '2026-11-03'),
  ('a0000000-0000-0000-0000-000000000004', 'Ravi Kumar', 'user', 'free', 'NP', '2026-11-04'),
  ('a0000000-0000-0000-0000-000000000005', 'Odd Name', 'user', 'platinum', null, '2026-11-05')
on conflict (id) do update
  set full_name = excluded.full_name, role = excluded.role, plan = excluded.plan,
      country_code = excluded.country_code, created_at = excluded.created_at;

-- Only these five users (local databases may hold leftovers from e2e runs; rolled back anyway).
delete from auth.users where email not like '%@prepora.test' and id::text not like 'a0000000-%';

-- Structure and privileges
select has_function('public', 'is_admin', array[]::text[], 'is_admin() exists');
select has_function('public', 'admin_list_users', array['text', 'text', 'plan_tier', 'integer', 'integer'], 'admin_list_users exists');
select has_function('public', 'admin_get_user', array['uuid'], 'admin_get_user exists');
select function_privs_are('public', 'admin_list_users', array['text', 'text', 'plan_tier', 'integer', 'integer'], 'anon', array[]::text[],
  'anon can''t call admin_list_users');
select function_privs_are('public', 'admin_get_user', array['uuid'], 'anon', array[]::text[],
  'anon can''t call admin_get_user');
select function_privs_are('public', 'is_admin', array[]::text[], 'anon', array[]::text[],
  'anon can''t call is_admin');

-- Helper: act as a signed-in user.
create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- A student: not admin, both RPCs refused.
select pg_temp.sign_in('a0000000-0000-0000-0000-000000000003');
select is(public.is_admin(), false, 'a student is not admin');
select throws_ok($$ select * from public.admin_list_users() $$, '42501', 'admin only', 'a student can''t list users');
select throws_ok($$ select * from public.admin_get_user('a0000000-0000-0000-0000-000000000004') $$, '42501', 'admin only',
  'a student can''t read another user');

-- A content editor: staff, but not admin.
select pg_temp.sign_in('a0000000-0000-0000-0000-000000000002');
select is(public.is_admin(), false, 'a content editor is not admin');
select throws_ok($$ select * from public.admin_list_users() $$, '42501', 'admin only', 'a content editor can''t list users');

-- The admin.
select pg_temp.sign_in('a0000000-0000-0000-0000-000000000001');
select is(public.is_admin(), true, 'the admin is admin');

select is((select count(*) from public.admin_list_users()), 5::bigint, 'lists every user');
select is((select total_count from public.admin_list_users() limit 1), 5::bigint, 'total_count = all matches');
select is((select email from public.admin_list_users() limit 1), 'odd_100%@example.com', 'newest first');

select is((select array_agg(email order by email) from public.admin_list_users(p_search => 'ASHA')),
  array['asha.rao@example.com'], 'search matches the email, case-insensitively');
select is((select array_agg(email order by email) from public.admin_list_users(p_search => ' kumar ')),
  array['ravi@example.com'], 'search matches the name, trimmed');
select is((select count(*) from public.admin_list_users(p_search => '%')), 1::bigint,
  '% is matched literally, not as a wildcard');
select is((select count(*) from public.admin_list_users(p_search => '_')), 1::bigint,
  '_ is matched literally, not as a wildcard');
select is((select count(*) from public.admin_list_users(p_search => 'nobody')), 0::bigint, 'no match → no rows');

select is((select array_agg(email order by email) from public.admin_list_users(p_country => 'np')),
  array['ravi@example.com'], 'filter by country (normalised)');
select is((select array_agg(email order by email) from public.admin_list_users(p_plan => 'gold')),
  array['asha.rao@example.com'], 'filter by plan');
select is((select count(*) from public.admin_list_users(p_search => 'example.com', p_country => 'IN')), 1::bigint,
  'search and filters combine');

select is((select count(*) from public.admin_list_users(p_limit => 2)), 2::bigint, 'limit');
select is((select array_agg(email) from public.admin_list_users(p_limit => 2, p_offset => 4)),
  array['boss@prepora.test'], 'offset: the last page (oldest)');
select is((select count(*) from public.admin_list_users(p_limit => 100000)), 5::bigint, 'limit is capped, not an error');

select results_eq(
  $$ select email, full_name, plan::text, country_code, last_sign_in_at, auth_provider
     from public.admin_get_user('a0000000-0000-0000-0000-000000000001') $$,
  $$ values ('boss@prepora.test', 'Admin Boss', 'free', 'IN', '2026-11-20 10:00+00'::timestamptz, 'google') $$,
  'admin_get_user returns the profile, email, last sign-in and provider');

reset role;
select * from finish();
rollback;
