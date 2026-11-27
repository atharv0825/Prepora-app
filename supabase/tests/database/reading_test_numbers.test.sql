-- Reading tests numbered per type, auto-named when created without a title. Run: supabase test db
begin;
select plan(14);

insert into auth.users (id, email) values ('4f000000-0000-0000-0000-000000000001', 'numbers-editor@prepora.test');
insert into public.profiles (id, full_name, role) values ('4f000000-0000-0000-0000-000000000001', 'Num Editor', 'content_editor')
on conflict (id) do update set role = excluded.role;

select has_column('public', 'reading_tests', 'test_no', 'reading_tests.test_no exists');
select col_not_null('public', 'reading_tests', 'test_no', 'every test has a number');

-- A clean slate for the counts (rolled back at the end).
delete from public.reading_tests;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4f000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.reading_tests (test_type, min_plan, created_by) values ('academic', 'free', auth.uid());
insert into public.reading_tests (test_type, min_plan, created_by) values ('academic', 'gold', auth.uid());
insert into public.reading_tests (test_type, min_plan, created_by) values ('general', 'free', auth.uid());

select results_eq(
  $$ select test_type::text, test_no, title from public.reading_tests order by test_type, test_no $$,
  $$ values ('academic', 1, 'Academic Test 1'), ('academic', 2, 'Academic Test 2'), ('general', 1, 'General Training Test 1') $$,
  'staff create tests without a title: numbered per type and named for it');

insert into public.reading_tests (test_type, title) values ('academic', 'My own name');
select is((select test_no from public.reading_tests where title = 'My own name'), 3, 'a given title is kept; the number still follows');

-- Can't set the number by hand, on insert or update.
insert into public.reading_tests (test_type, test_no) values ('general', 99);
select is((select max(test_no) from public.reading_tests where test_type = 'general'), 2, 'an insert''s test_no is replaced by the next one');
update public.reading_tests set test_no = 50 where title = 'Academic Test 1';
select is((select test_no from public.reading_tests where title = 'Academic Test 1'), 1, 'an update can''t change the number');

-- Renaming keeps the number; blanking the title names it again.
update public.reading_tests set title = 'Renamed' where test_type = 'academic' and test_no = 2;
select is((select test_no from public.reading_tests where title = 'Renamed'), 2, 'renaming keeps the number');
update public.reading_tests set title = '  ' where title = 'Renamed';
select is((select title from public.reading_tests where test_type = 'academic' and test_no = 2), 'Academic Test 2', 'a blank title goes back to the generated name');

-- Moving to the other type: the next number there; a generated title follows, a custom one stays.
update public.reading_tests set test_type = 'general' where title = 'Academic Test 1';
select results_eq(
  $$ select test_no, title from public.reading_tests where test_type = 'general' order by test_no $$,
  $$ values (1, 'General Training Test 1'), (2, 'General Training Test 2'), (3, 'General Training Test 3') $$,
  'a generated title follows the move to General Training');
update public.reading_tests set test_type = 'general' where title = 'My own name';
select is((select test_no from public.reading_tests where title = 'My own name'), 4, 'a custom title stays; it gets the next General number');

-- Numbers are unique per type.
reset role;
select throws_ok(
  $$ update public.reading_tests set test_no = 1 where false; alter table public.reading_tests disable trigger reading_tests_number;
     update public.reading_tests set test_no = 1 where test_type = 'general' and test_no = 2 $$,
  '23505', null, 'the same number twice in a type is refused');
alter table public.reading_tests enable trigger reading_tests_number;

-- Students can't create tests (RLS), even untitled.
insert into auth.users (id, email) values ('4f000000-0000-0000-0000-000000000002', 'numbers-student@prepora.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4f000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ insert into public.reading_tests (test_type) values ('academic') $$, '42501', null, 'students can''t create tests');
reset role;

select is(public.reading_test_title('general', 7), 'General Training Test 7', 'reading_test_title names General Training');
select function_privs_are('public', 'next_reading_test_no', array['public.ielts_test_type'], 'authenticated', array[]::text[],
  'signed-in users can''t call the numbering function directly');

select * from finish();
rollback;
