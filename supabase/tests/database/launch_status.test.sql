-- M2-B2: get_launch_status(country). Run: supabase test db
begin;
select plan(17);

select has_function('public', 'get_launch_status', array['text'], 'get_launch_status(text) exists');
select function_returns('public', 'get_launch_status', array['text'], 'launch_status', 'returns launch_status');
select enum_has_labels('public', 'launch_status', array['enabled', 'waitlist'], 'launch_status values');
select function_privs_are('public', 'get_launch_status', array['text'], 'anon', array['EXECUTE'],
  'anon can call it (the gate runs before sign-in)');
select is(
  (select prosecdef from pg_proc where oid = 'public.get_launch_status(text)'::regprocedure), false,
  'runs with the caller''s rights (SECURITY INVOKER)');

-- As a visitor would call it (public key).
set local role anon;
select is(public.get_launch_status('IN'), 'enabled', 'India (Wave 1) → enabled');
select is(public.get_launch_status('NP'), 'enabled', 'Nepal (Wave 1) → enabled');
select is(public.get_launch_status(' bd '), 'enabled', 'input is trimmed and uppercased');
select is(public.get_launch_status('PH'), 'waitlist', 'Philippines (Wave 2, disabled) → waitlist');
select is(public.get_launch_status('CN'), 'waitlist', 'listed but unscheduled → waitlist');
select is(public.get_launch_status('US'), 'waitlist', 'not listed → waitlist');
select is(public.get_launch_status('XX'), 'waitlist', 'Cloudflare unknown (XX) → waitlist');
select is(public.get_launch_status('T1'), 'waitlist', 'Tor (T1) → waitlist');
select is(public.get_launch_status(null), 'waitlist', 'no country → waitlist');
select is(public.get_launch_status('India'), 'waitlist', 'not an ISO code → waitlist');
reset role;

-- Enabling a country (what the admin toggle in M2-A2 will do) opens it immediately.
update public.country_regions set is_enabled = true where country_code = 'PH';
set local role authenticated;
select is(public.get_launch_status('PH'), 'enabled', 'a newly enabled country → enabled');
reset role;
update public.country_regions set is_enabled = false where country_code = 'IN';
select is(public.get_launch_status('IN'), 'waitlist', 'a disabled country → waitlist');

select * from finish();
rollback;
