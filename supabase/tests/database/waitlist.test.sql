-- M0-F4: waitlist security and behaviour. Run: supabase test db
begin;
select plan(12);

-- Structure
select has_table('public', 'waitlist', 'waitlist table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.waitlist'::regclass),
  'RLS is enabled on waitlist'
);
select function_privs_are('public', 'join_waitlist', array['text', 'text', 'text'], 'anon', array['EXECUTE'],
  'anon can execute join_waitlist');

-- Act as the public (anon) role, like the website does
set local role anon;

select throws_ok(
  $$ select * from public.waitlist $$,
  '42501', null, 'anon cannot read the waitlist'
);
select throws_ok(
  $$ insert into public.waitlist (email) values ('direct@example.com') $$,
  '42501', null, 'anon cannot insert directly'
);
select lives_ok(
  $$ select public.join_waitlist('Student@Example.com', 'in', 'hero') $$,
  'anon can join through join_waitlist()'
);
select lives_ok(
  $$ select public.join_waitlist('  student@example.COM ', 'IN', 'final_cta') $$,
  'joining again with the same email (other case/spaces) does not fail'
);
select throws_ok(
  $$ select public.join_waitlist('not-an-email', 'IN', null) $$,
  '22023', 'invalid email', 'invalid email is rejected'
);
select lives_ok(
  $$ select public.join_waitlist('tor@example.com', 'T1', null) $$,
  'non-country code from Cloudflare is accepted'
);

reset role;

-- Verify what was stored (as the table owner)
select is(
  (select count(*)::int from public.waitlist where email = 'student@example.com'),
  1, 'duplicate email stored once, lowercased and trimmed'
);
select is(
  (select country_code::text || '/' || source from public.waitlist where email = 'student@example.com'),
  'IN/hero', 'first sign-up is kept (country uppercased, source stored)'
);
select is(
  (select country_code from public.waitlist where email = 'tor@example.com'),
  null, 'T1/XX country codes are stored as null'
);

select * from finish();
rollback;
