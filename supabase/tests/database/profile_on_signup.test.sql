-- M1-B2: every new auth user gets a profiles row (role user, plan free) with their name from the
-- sign-up metadata. Run: supabase test db
begin;
select plan(13);

select has_trigger('auth', 'users', 'create_profile_on_signup', 'auth.users has the profile trigger');
select ok(
  'create_profile_on_signup' < 'grant_credits_on_signup',
  'the profile trigger fires before the credit grant (same-event triggers run by name)'
);

-- A Google sign-up: the name comes from full_name.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-1111-4111-8111-111111111111', 'g@example.com', '{"full_name": "  Asha Rao ", "name": "Ignored", "iss": "https://accounts.google.com"}'),
  ('a2222222-2222-4222-8222-222222222222', 'n@example.com', '{"name": "Only Name"}'),
  ('a3333333-3333-4333-8333-333333333333', 'blank@example.com', '{"full_name": "   "}'),
  ('a4444444-4444-4444-8444-444444444444', 'none@example.com', null),
  ('a5555555-5555-4555-8555-555555555555', 'long@example.com', jsonb_build_object('full_name', repeat('x', 150)));

select results_eq(
  $$ select full_name, role::text, plan::text from public.profiles where id = 'a1111111-1111-4111-8111-111111111111' $$,
  $$ values ('Asha Rao'::text, 'user'::text, 'free'::text) $$,
  'a new user gets a profile: trimmed name, role user, plan free'
);
select is((select full_name from public.profiles where id = 'a2222222-2222-4222-8222-222222222222'), 'Only Name', 'falls back to "name"');
select is((select full_name from public.profiles where id = 'a3333333-3333-4333-8333-333333333333'), null, 'a blank name is null');
select is((select full_name from public.profiles where id = 'a4444444-4444-4444-8444-444444444444'), null, 'no metadata: null name, still a row');
select is((select char_length(full_name) from public.profiles where id = 'a5555555-5555-4555-8555-555555555555'), 100, 'a long name is cut to 100 characters');
select is(
  (select count(*)::int from public.profiles where id in (
    'a1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 'a3333333-3333-4333-8333-333333333333',
    'a4444444-4444-4444-8444-444444444444', 'a5555555-5555-4555-8555-555555555555')),
  5, 'one row per new user'
);

-- The sign-up credits still arrive (the grant trigger runs after the profile exists).
select ok(
  (select count(*) > 0 from public.credit_ledger where user_id = 'a1111111-1111-4111-8111-111111111111' and reason = 'grant'),
  'sign-up credits are still granted'
);

-- The name helper on its own.
select is(public.signup_full_name('{"full_name": "  Ravi  "}'::jsonb), 'Ravi', 'signup_full_name trims');
select is(public.signup_full_name('{}'::jsonb), null, 'signup_full_name: nothing → null');

-- Nobody can call the trigger function or the helper through the API.
select ok(not has_function_privilege('authenticated', 'public.on_auth_user_created_profile()', 'execute'), 'authenticated cannot call the trigger function');
select ok(not has_function_privilege('anon', 'public.signup_full_name(jsonb)', 'execute'), 'anon cannot call the name helper');

select * from finish();
rollback;
