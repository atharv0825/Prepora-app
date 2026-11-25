-- M5-A1 Listening builder: admin_get_listening_test, admin_order_listening_questions. Run: supabase test db
begin;
select plan(14);

insert into auth.users (id, email) values
  ('5d000000-0000-0000-0000-000000000001', 'student@prepora.test'),
  ('5d000000-0000-0000-0000-000000000002', 'editor@prepora.test');
insert into public.profiles (id, role, plan) values
  ('5d000000-0000-0000-0000-000000000001', 'user', 'platinum'),
  ('5d000000-0000-0000-0000-000000000002', 'content_editor', 'free')
on conflict (id) do update set role = excluded.role, plan = excluded.plan;

-- A draft: questions 1–2 in section 1, 11 in section 2.
insert into public.listening_tests (id, title) values ('5d100000-0000-0000-0000-000000000001', 'Builder draft');
insert into public.listening_sections (id, test_id, order_no, title, transcript)
select ('5d20000' || n || '-0000-0000-0000-000000000000')::uuid, '5d100000-0000-0000-0000-000000000001', n, 'Part ' || n, 'Said in part ' || n
from generate_series(1, 4) n;
insert into public.listening_questions (id, test_id, section_id, q_no, q_type, prompt, answer, explanation) values
  ('5d300000-0000-0000-0000-000000000001', '5d100000-0000-0000-0000-000000000001', '5d200001-0000-0000-0000-000000000000', 1, 'tfng', 'First', '{"value": "true"}', 'Part 1 says so.'),
  ('5d300000-0000-0000-0000-000000000002', '5d100000-0000-0000-0000-000000000001', '5d200001-0000-0000-0000-000000000000', 2, 'tfng', 'Second', '{"value": "false"}', null),
  ('5d300000-0000-0000-0000-000000000003', '5d100000-0000-0000-0000-000000000001', '5d200002-0000-0000-0000-000000000000', 11, 'tfng', 'Eleventh', '{"value": "true"}', null);

select function_privs_are('public', 'admin_get_listening_test', array['uuid'], 'anon', array[]::text[], 'anon can''t call admin_get_listening_test');
select function_privs_are('public', 'admin_order_listening_questions', array['uuid', 'uuid[]'], 'anon', array[]::text[],
  'anon can''t call admin_order_listening_questions');
select is((select prosecdef from pg_proc where proname = 'admin_get_listening_test'), true, 'keys and transcripts are read as definer');

create function pg_temp.sign_in(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.sign_in('5d000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.admin_get_listening_test('5d100000-0000-0000-0000-000000000001') $$, '42501', 'staff only',
  'a student (even Platinum) can''t read keys or transcripts');
select throws_ok($$ select public.admin_order_listening_questions('5d100000-0000-0000-0000-000000000001',
  array['5d300000-0000-0000-0000-000000000002', '5d300000-0000-0000-0000-000000000001', '5d300000-0000-0000-0000-000000000003']::uuid[]) $$,
  '42501', 'staff only', 'a student can''t renumber');

select pg_temp.sign_in('5d000000-0000-0000-0000-000000000002');
create temp table t as select public.admin_get_listening_test('5d100000-0000-0000-0000-000000000001') as j;
select is((select jsonb_array_length(j -> 'sections') from t), 4, 'the editor gets the 4 sections');
select is((select j -> 'sections' -> 0 ->> 'transcript' from t), 'Said in part 1', 'with transcripts');
select is((select j -> 'questions' -> 0 -> 'answer' from t), '{"value": "true"}'::jsonb, 'and answer keys');
select is((select j -> 'questions' -> 0 ->> 'explanation' from t), 'Part 1 says so.', 'and explanations');
select throws_ok($$ select public.admin_get_listening_test('5d1fffff-0000-0000-0000-000000000000') $$, 'P0002', 'test not found', 'unknown → P0002');

-- Swap 1 and 2; section 2's question keeps 11 whatever its place in the list.
select lives_ok($$ select public.admin_order_listening_questions('5d100000-0000-0000-0000-000000000001',
  array['5d300000-0000-0000-0000-000000000003', '5d300000-0000-0000-0000-000000000002', '5d300000-0000-0000-0000-000000000001']::uuid[]) $$,
  'the editor swaps questions 1 and 2');
select results_eq($$ select q_no::int, prompt from public.listening_questions where test_id = '5d100000-0000-0000-0000-000000000001' order by q_no $$,
  $$ values (1, 'Second'), (2, 'First'), (11, 'Eleventh') $$, 'numbers follow the order within each section');
select throws_ok($$ select public.admin_order_listening_questions('5d100000-0000-0000-0000-000000000001',
  array['5d300000-0000-0000-0000-000000000001']::uuid[]) $$,
  '22023', 'the order must list every question of the test once', 'a question left out is refused');

-- After a delete, the section closes the gap.
delete from public.listening_questions where id = '5d300000-0000-0000-0000-000000000002';
select public.admin_order_listening_questions('5d100000-0000-0000-0000-000000000001',
  array['5d300000-0000-0000-0000-000000000001', '5d300000-0000-0000-0000-000000000003']::uuid[]);
select results_eq($$ select q_no::int from public.listening_questions where test_id = '5d100000-0000-0000-0000-000000000001' order by q_no $$,
  array[1, 11], 'renumbering after a delete closes the gap within the section');

reset role;
select * from finish();
rollback;
