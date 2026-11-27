-- Listening tests numbered and auto-named when created without a title. Run: supabase test db
begin;
select plan(10);

insert into auth.users (id, email) values ('4f100000-0000-0000-0000-000000000001', 'lnumbers-editor@prepora.test');
insert into public.profiles (id, full_name, role) values ('4f100000-0000-0000-0000-000000000001', 'Lis Editor', 'content_editor')
on conflict (id) do update set role = excluded.role;

select has_column('public', 'listening_tests', 'test_no', 'listening_tests.test_no exists');
select col_not_null('public', 'listening_tests', 'test_no', 'every Listening test has a number');

delete from public.listening_tests; -- a clean slate (rolled back at the end)

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4f100000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.listening_tests (min_plan, created_by) values ('free', auth.uid());
insert into public.listening_tests (min_plan, created_by) values ('gold', auth.uid());
select results_eq(
  $$ select test_no, title from public.listening_tests order by test_no $$,
  $$ values (1, 'Listening Test 1'), (2, 'Listening Test 2') $$,
  'staff create tests without a title: numbered and named');

insert into public.listening_tests (title) values ('My listening');
select is((select test_no from public.listening_tests where title = 'My listening'), 3, 'a given title is kept; the number still follows');

insert into public.listening_tests (test_no) values (99);
select is((select max(test_no) from public.listening_tests), 4, 'an insert''s test_no is replaced by the next one');
update public.listening_tests set test_no = 50 where title = 'Listening Test 1';
select is((select test_no from public.listening_tests where title = 'Listening Test 1'), 1, 'an update can''t change the number');

update public.listening_tests set title = 'Renamed' where test_no = 2;
select is((select test_no from public.listening_tests where title = 'Renamed'), 2, 'renaming keeps the number');
update public.listening_tests set title = '' where test_no = 2;
select is((select title from public.listening_tests where test_no = 2), 'Listening Test 2', 'a blank title goes back to the generated name');

reset role;
alter table public.listening_tests disable trigger listening_tests_number;
select throws_ok($$ insert into public.listening_tests (title, test_no) values ('dup', 1) $$, '23505', null, 'numbers are unique');
alter table public.listening_tests enable trigger listening_tests_number;

insert into auth.users (id, email) values ('4f100000-0000-0000-0000-000000000002', 'lnumbers-student@prepora.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4f100000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ insert into public.listening_tests (min_plan) values ('free') $$, '42501', null, 'students can''t create tests');
reset role;

select * from finish();
rollback;
