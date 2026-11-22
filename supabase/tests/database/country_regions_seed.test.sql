-- M2-B1: country_regions seed (APAC, Wave 1 enabled). Run: supabase test db
begin;
select plan(14);

select is((select count(*)::int from public.country_regions), 40, '40 APAC countries are listed');

select set_eq(
  $$ select country_code::text from public.country_regions where is_enabled $$,
  array['IN', 'NP', 'BD', 'LK'],
  'exactly Wave 1 (IN, NP, BD, LK) is enabled');
select set_eq(
  $$ select country_code::text from public.country_regions where launch_wave = 1 $$,
  array['IN', 'NP', 'BD', 'LK'], 'Wave 1 countries');
select set_eq(
  $$ select country_code::text from public.country_regions where launch_wave = 2 $$,
  array['PH', 'VN', 'ID', 'MY', 'TH', 'PK'], 'Wave 2 countries (§8.2)');
select set_eq(
  $$ select country_code::text from public.country_regions where launch_wave = 3 $$,
  array['AU', 'NZ', 'SG', 'HK', 'JP', 'KR', 'TW'], 'Wave 3 countries (§8.2)');
select is_empty(
  $$ select 1 from public.country_regions where launch_wave > 1 and is_enabled $$,
  'no later-wave country is enabled');

select is((select region::text from public.country_regions where country_code = 'IN'), 'IN', 'India is its own region');
select is((select region::text from public.country_regions where country_code = 'NP'), 'SA', 'Nepal is South Asia');
select is((select region::text from public.country_regions where country_code = 'SG'), 'SEA', 'Singapore is South-East Asia');
select is((select region::text from public.country_regions where country_code = 'AU'), 'ANZ', 'Australia is ANZ');

select ok(
  (select launch_wave is null and not is_enabled from public.country_regions where country_code = 'CN'),
  'mainland China is listed, unscheduled and disabled (out of scope)');
select is_empty($$ select 1 from public.country_regions where country_code = 'KP' $$, 'North Korea is not listed');
select is_empty($$ select 1 from public.country_regions where country_code in ('US', 'GB', 'AE') $$,
  'countries outside APAC are not listed');

-- What the country gate (M2-B2/F1) will see as an anonymous visitor.
set local role anon;
select is(
  (select count(*)::int from public.country_regions where is_enabled), 4,
  'anon sees the 4 enabled countries');
reset role;

select * from finish();
rollback;
